import os
import socket
import threading
from typing import Dict, Any
from constants import (
    DEFAULT_PORT,
    KEY_DEVICE_NAME,
    KEY_APP_NAME,
    KEY_APP_VERSION,
    KEY_PLATFORM,
    KEY_PROTOCOL_VERSION,
    KEY_TEXT_MESSAGE,
    KEY_SENDER_NAME,
    KEY_TRANSFER_ID,
    KEY_FILE_NAME,
    KEY_FILE_SIZE,
    KEY_CHUNK_SIZE,
    KEY_CHUNK_NUMBER,
    KEY_BINARY_DATA
)
from packet_types import PacketType
from packet import Packet
from field_writer import FieldWriter
from field_reader import FieldReader
from dispatcher import Dispatcher
from connection import Connection

class ActiveTransfer:
    """Helper class to track file download states on the server."""
    def __init__(self, transfer_id: int, file_name: str, file_size: int, chunk_size: int):
        self.transfer_id = transfer_id
        self.file_name = os.path.basename(file_name)  # Sanitize to prevent path traversal
        self.file_size = file_size
        self.chunk_size = chunk_size
        self.bytes_received = 0
        self.chunks_received = 0
        self.file_ref = None

class ServerDispatcher(Dispatcher):
    """
    Server-side packet dispatcher.
    Implements business logic for managing connections, responding to handshakes,
    printing text messages, and assembling files received via chunk stream.
    """

    def __init__(self):
        self.active_transfers: Dict[int, ActiveTransfer] = {}
        os.makedirs("received_files", exist_ok=True)

    def on_handshake(self, connection: Connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            dev_name = reader.get_string(KEY_DEVICE_NAME)
            app_name = reader.get_string(KEY_APP_NAME)
            app_ver = reader.get_string(KEY_APP_VERSION)
            platform = reader.get_string(KEY_PLATFORM)
            proto_ver = reader.get_short(KEY_PROTOCOL_VERSION)

            print(f"\n[Server] Handshake received from client!")
            print(f"  Device: {dev_name} ({platform})")
            print(f"  App: {app_name} v{app_ver}")
            print(f"  Protocol Version: {proto_ver}")

            # Send HANDSHAKE_ACK
            writer = FieldWriter()
            writer.write_boolean(0x01, True)  # Key 0x01: Success status
            writer.write_string(0x02, "Server Ready")
            
            ack_packet = Packet(PacketType.HANDSHAKE_ACK, writer.get_bytes())
            connection.send_packet(ack_packet)
            print("[Server] Handshake Approved. Sent HANDSHAKE_ACK.")
        except Exception as e:
            print(f"[Server] Handshake failed: {e}")
            connection.close()

    def on_text(self, connection: Connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            sender = reader.get_string(KEY_SENDER_NAME, default="Unknown Client")
            message = reader.get_string(KEY_TEXT_MESSAGE)
            print(f"\n[Client Message] {sender}: {message}")
        except Exception as e:
            print(f"[Server] Error reading text packet: {e}")

    def on_file_start(self, connection: Connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)
            file_name = reader.get_string(KEY_FILE_NAME)
            file_size = reader.get_long(KEY_FILE_SIZE)
            chunk_size = reader.get_int(KEY_CHUNK_SIZE)

            print(f"\n[File Transfer] Initializing download:")
            print(f"  Transfer ID: {transfer_id}")
            print(f"  Name: {file_name}")
            print(f"  Size: {file_size} bytes")
            print(f"  Chunk Size: {chunk_size} bytes")

            transfer = ActiveTransfer(transfer_id, file_name, file_size, chunk_size)
            save_path = os.path.join("received_files", transfer.file_name)
            
            # Open file for writing binary chunks
            transfer.file_ref = open(save_path, "wb")
            self.active_transfers[transfer_id] = transfer
            print(f"[Server] File created: {save_path}. Awaiting chunks...")
        except Exception as e:
            print(f"[Server] Error initiating file transfer: {e}")

    def on_file_chunk(self, connection: Connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)
            chunk_num = reader.get_int(KEY_CHUNK_NUMBER)
            binary_data = reader.get_bytes(KEY_BINARY_DATA)

            if transfer_id not in self.active_transfers:
                print(f"[Server] Error: Received chunk for inactive transfer ID {transfer_id}")
                return

            transfer = self.active_transfers[transfer_id]
            if transfer.file_ref:
                transfer.file_ref.write(binary_data)
                transfer.bytes_received += len(binary_data)
                transfer.chunks_received += 1
                
                pct = (transfer.bytes_received / transfer.file_size) * 100 if transfer.file_size > 0 else 100
                print(f"  Chunk #{chunk_num} received: {len(binary_data)} bytes ({pct:.1f}% downloaded)", end="\r")
        except Exception as e:
            print(f"\n[Server] Error parsing file chunk: {e}")

    def on_file_end(self, connection: Connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)

            if transfer_id not in self.active_transfers:
                print(f"[Server] Error: FILE_END for inactive transfer ID {transfer_id}")
                return

            transfer = self.active_transfers[transfer_id]
            if transfer.file_ref:
                transfer.file_ref.close()
                transfer.file_ref = None

            print(f"\n[File Transfer Complete] Saved '{transfer.file_name}' to 'received_files/' folder.")
            print(f"  Total size: {transfer.bytes_received} bytes across {transfer.chunks_received} chunks.")
            del self.active_transfers[transfer_id]
        except Exception as e:
            print(f"\n[Server] Error completing file transfer: {e}")

    def on_ping(self, connection: Connection, packet: Packet) -> None:
        print("[Server] Ping received. Replying with Pong.")
        pong_packet = Packet(PacketType.PONG)
        connection.send_packet(pong_packet)

    def on_disconnect(self, connection: Connection, packet: Packet) -> None:
        print("\n[Server] Client disconnected.")
        # Cleanup any unfinished transfers
        for tid, transfer in list(self.active_transfers.items()):
            if transfer.file_ref:
                transfer.file_ref.close()
                try:
                    os.remove(os.path.join("received_files", transfer.file_name))
                except OSError:
                    pass
            del self.active_transfers[tid]

class CustomTCPServer:
    """Multi-threaded custom binary TCP protocol server."""

    def __init__(self, host: str = "0.0.0.0", port: int = DEFAULT_PORT):
        self.host = host
        self.port = port
        self.server_sock: Optional[socket.socket] = None
        self.is_running = False
        self.connections = []

    def start(self) -> None:
        """Start listening and accept clients on a background thread."""
        self.server_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.server_sock.bind((self.host, self.port))
            self.server_sock.listen(5)
            self.is_running = True
            print(f"[Server] Custom binary TCP protocol server listening on {self.host}:{self.port}")
            
            accept_thread = threading.Thread(target=self._accept_loop, name="Server-Acceptor", daemon=True)
            accept_thread.start()
        except Exception as e:
            print(f"[Server] Failed to start server: {e}")

    def stop(self) -> None:
        """Shutdown the server and close all client connections."""
        self.is_running = False
        if self.server_sock:
            try:
                self.server_sock.close()
            except socket.error:
                pass
        
        print("[Server] Stopping and closing client connections...")
        for conn in self.connections:
            conn.close()
        self.connections.clear()

    def _accept_loop(self) -> None:
        while self.is_running:
            try:
                client_sock, addr = self.server_sock.accept()
                print(f"\n[Server] Direct socket connection accepted from {addr[0]}:{addr[1]}")
                
                # Wrap socket inside our thread-safe connection with server dispatch logic
                dispatcher = ServerDispatcher()
                connection = Connection(client_sock, dispatcher)
                self.connections.append(connection)
                
                connection.start()
            except socket.error:
                # Triggers when server_sock.close() is called
                break

if __name__ == "__main__":
    server = CustomTCPServer()
    server.start()
    try:
        # Keep main thread alive
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        server.stop()
