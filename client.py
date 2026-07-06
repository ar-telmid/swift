import os
import socket
import time
from typing import Optional
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

class ClientDispatcher(Dispatcher):
    """
    Client-side packet dispatcher.
    Handles inbound server messages such as Handshake ACKs, PONG replies,
    and server disconnect notification events.
    """

    def on_handshake_ack(self, connection: Connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            success = reader.get_boolean(0x01, default=False)
            message = reader.get_string(0x02, default="No message")
            print(f"\n[Client] Handshake ACK received! Status: {'Approved' if success else 'Rejected'} - Message: {message}")
        except Exception as e:
            print(f"[Client] Error reading handshake ack: {e}")

    def on_pong(self, connection: Connection, packet: Packet) -> None:
        print("\n[Client] Pong reply received from server.")

    def on_disconnect(self, connection: Connection, packet: Packet) -> None:
        print("\n[Client] Disconnected from server.")

class CustomTCPClient:
    """Object-oriented binary client for the custom protocol."""

    def __init__(self):
        self.connection: Optional[Connection] = None
        self.dispatcher = ClientDispatcher()
        self._transfer_counter = 1

    def connect(self, host: str = "127.0.0.1", port: int = DEFAULT_PORT) -> bool:
        """Connect to the server and start the background listener thread."""
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.connect((host, port))
            self.connection = Connection(sock, self.dispatcher)
            self.connection.start()
            print(f"[Client] Connected to server at {host}:{port}")
            return True
        except Exception as e:
            print(f"[Client] Failed to connect: {e}")
            return False

    def send_handshake(self) -> None:
        """Send the protocol handshake with device and platform details."""
        if not self.connection or not self.connection.is_active:
            raise ConnectionError("No active server connection.")

        writer = FieldWriter()
        writer.write_string(KEY_DEVICE_NAME, "PythonClient-Node")
        writer.write_string(KEY_APP_NAME, "CustomBinaryProtocolPlayground")
        writer.write_string(KEY_APP_VERSION, "1.0.0")
        writer.write_string(KEY_PLATFORM, "Linux/MacOS")
        writer.write_short(KEY_PROTOCOL_VERSION, 1)

        packet = Packet(PacketType.HANDSHAKE, writer.get_bytes())
        self.connection.send_packet(packet)
        print("[Client] Sent HANDSHAKE packet.")

    def send_chat(self, sender: str, message: str) -> None:
        """Send a standard text chat message packet."""
        if not self.connection or not self.connection.is_active:
            raise ConnectionError("No active server connection.")

        writer = FieldWriter()
        writer.write_string(KEY_SENDER_NAME, sender)
        writer.write_string(KEY_TEXT_MESSAGE, message)

        packet = Packet(PacketType.TEXT, writer.get_bytes())
        self.connection.send_packet(packet)
        print(f"[Client] Sent chat message: '{message}'")

    def send_ping(self) -> None:
        """Send a heartbeat PING packet."""
        if not self.connection or not self.connection.is_active:
            raise ConnectionError("No active server connection.")

        packet = Packet(PacketType.PING)
        self.connection.send_packet(packet)
        print("[Client] Sent PING heartbeat.")

    def send_file(self, file_path: str, chunk_size: int = 4096) -> None:
        """
        Send a local file over the network split into serialized binary chunks.
        
        :param file_path: The local path to the file to send
        :param chunk_size: Maximum size of individual data payloads (default 4KB)
        """
        if not self.connection or not self.connection.is_active:
            raise ConnectionError("No active server connection.")

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Local file not found: {file_path}")

        file_name = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        transfer_id = self._transfer_counter
        self._transfer_counter += 1

        print(f"\n[Client] Initiating high-speed file transfer for '{file_name}':")
        print(f"  Size: {file_size} bytes")
        print(f"  Chunk Size: {chunk_size} bytes")

        # 1. Send FILE_START packet
        start_writer = FieldWriter()
        start_writer.write_int(KEY_TRANSFER_ID, transfer_id)
        start_writer.write_string(KEY_FILE_NAME, file_name)
        start_writer.write_long(KEY_FILE_SIZE, file_size)
        start_writer.write_int(KEY_CHUNK_SIZE, chunk_size)

        start_packet = Packet(PacketType.FILE_START, start_writer.get_bytes())
        self.connection.send_packet(start_packet)
        print("[Client] FILE_START packet transmitted.")

        # 2. Read and stream FILE_CHUNK packets
        chunk_number = 0
        bytes_sent = 0

        with open(file_path, "rb") as f:
            while True:
                data = f.read(chunk_size)
                if not data:
                    break

                chunk_number += 1
                chunk_writer = FieldWriter()
                chunk_writer.write_int(KEY_TRANSFER_ID, transfer_id)
                chunk_writer.write_int(KEY_CHUNK_NUMBER, chunk_number)
                chunk_writer.write_bytes(KEY_BINARY_DATA, data)

                chunk_packet = Packet(PacketType.FILE_CHUNK, chunk_writer.get_bytes())
                self.connection.send_packet(chunk_packet)
                bytes_sent += len(data)

                pct = (bytes_sent / file_size) * 100 if file_size > 0 else 100
                print(f"  Streamed chunk #{chunk_number}: {len(data)} bytes ({pct:.1f}% sent)", end="\r")
                
                # Small micro-sleep in fast local Wi-Fi simulations prevents overwhelming socket buffers
                time.sleep(0.001)

        print() # New line after carriage return progress info

        # 3. Send FILE_END packet
        end_writer = FieldWriter()
        end_writer.write_int(KEY_TRANSFER_ID, transfer_id)

        end_packet = Packet(PacketType.FILE_END, end_writer.get_bytes())
        self.connection.send_packet(end_packet)
        print("[Client] FILE_END packet transmitted. Complete.")

    def disconnect(self) -> None:
        """Gracefully notify server of disconnection and close connection."""
        if self.connection and self.connection.is_active:
            try:
                # Transmit a disconnect notification
                self.connection.send_packet(Packet(PacketType.DISCONNECT))
            except Exception:
                pass
            self.connection.close()
            print("[Client] Connection closed.")

if __name__ == "__main__":
    # Small test runner if executed directly
    client = CustomTCPClient()
    if client.connect("127.0.0.1", DEFAULT_PORT):
        try:
            client.send_handshake()
            time.sleep(0.5)
            client.send_chat("Alice", "Hello from custom protocol!")
            time.sleep(0.5)
            client.send_ping()
            time.sleep(0.5)
        finally:
            client.disconnect()
