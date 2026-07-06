import os
import time
from typing import Dict
from packet import Packet
from packet_types import PacketType
from field_reader import FieldReader
from field_writer import FieldWriter
from constants import (
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

class Dispatcher:
    """
    Routes incoming packets to type-specific callback handler methods.
    
    This is an abstract/base dispatcher class. Real server or client implementations
    subclass this to implement their specific application logic (e.g., printing chat
    messages or saving file chunks to disk).
    """

    def dispatch(self, connection, packet: Packet) -> None:
        """
        Dispatches a packet to its designated callback.
        
        :param connection: The active Connection instance that received this packet
        :param packet: The received Packet instance
        """
        try:
            pt = PacketType(packet.packet_type)
        except ValueError:
            print(f"[Dispatcher] Warning: Received unknown packet type: {packet.packet_type}")
            return

        if pt == PacketType.HANDSHAKE:
            self.on_handshake(connection, packet)
        elif pt == PacketType.HANDSHAKE_ACK:
            self.on_handshake_ack(connection, packet)
        elif pt == PacketType.TEXT:
            self.on_text(connection, packet)
        elif pt == PacketType.FILE_START:
            self.on_file_start(connection, packet)
        elif pt == PacketType.FILE_CHUNK:
            self.on_file_chunk(connection, packet)
        elif pt == PacketType.FILE_END:
            self.on_file_end(connection, packet)
        elif pt == PacketType.PING:
            self.on_ping(connection, packet)
        elif pt == PacketType.PONG:
            self.on_pong(connection, packet)
        elif pt == PacketType.DISCONNECT:
            self.on_disconnect(connection, packet)

    def on_handshake(self, connection, packet: Packet) -> None:
        """Called when a HANDSHAKE packet is received."""
        pass

    def on_handshake_ack(self, connection, packet: Packet) -> None:
        """Called when a HANDSHAKE_ACK packet is received."""
        pass

    def on_text(self, connection, packet: Packet) -> None:
        """Called when a TEXT packet is received."""
        pass

    def on_file_start(self, connection, packet: Packet) -> None:
        """Called when a FILE_START packet is received."""
        pass

    def on_file_chunk(self, connection, packet: Packet) -> None:
        """Called when a FILE_CHUNK packet is received."""
        pass

    def on_file_end(self, connection, packet: Packet) -> None:
        """Called when a FILE_END packet is received."""
        pass

    def on_ping(self, connection, packet: Packet) -> None:
        """Called when a PING packet is received."""
        pass

    def on_pong(self, connection, packet: Packet) -> None:
        """Called when a PONG packet is received."""
        pass

    def on_disconnect(self, connection, packet: Packet) -> None:
        """Called when a DISCONNECT packet is received."""
        pass


class ActiveTransfer:
    """Helper class to track file download states on a peer."""
    def __init__(self, transfer_id: int, file_name: str, file_size: int, chunk_size: int, node_name: str):
        self.transfer_id = transfer_id
        self.file_name = os.path.basename(file_name)  # Sanitize to prevent path traversal
        self.file_size = file_size
        self.chunk_size = chunk_size
        self.bytes_received = 0
        self.chunks_received = 0
        self.file_ref = None
        self.node_name = node_name


class PeerDispatcher(Dispatcher):
    """
    Symmetric peer-to-peer packet dispatcher.
    Handles packets identically on both sides of the connection, perfectly supporting P2P.
    """

    def __init__(self, node_name: str = "Peer"):
        super().__init__()
        self.node_name = node_name
        self.active_transfers: Dict[int, ActiveTransfer] = {}
        os.makedirs("received_files", exist_ok=True)

    def on_handshake(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            dev_name = reader.get_string(KEY_DEVICE_NAME)
            app_name = reader.get_string(KEY_APP_NAME)
            app_ver = reader.get_string(KEY_APP_VERSION)
            platform = reader.get_string(KEY_PLATFORM)
            proto_ver = reader.get_short(KEY_PROTOCOL_VERSION)

            print(f"\n[{self.node_name}] Received HANDSHAKE from remote peer:")
            print(f"  Device: {dev_name} ({platform})")
            print(f"  App: {app_name} v{app_ver}")
            print(f"  Protocol Version: {proto_ver}")

            # Send HANDSHAKE_ACK back
            writer = FieldWriter()
            writer.write_boolean(0x01, True)  # Key 0x01: Success status
            writer.write_string(0x02, f"Approved by {self.node_name}")
            
            ack_packet = Packet(PacketType.HANDSHAKE_ACK, writer.get_bytes())
            connection.send_packet(ack_packet)
            print(f"[{self.node_name}] Returned HANDSHAKE_ACK.")
        except Exception as e:
            print(f"[{self.node_name}] Handshake parsing failed: {e}")
            connection.close()

    def on_handshake_ack(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            success = reader.get_boolean(0x01, default=False)
            message = reader.get_string(0x02, default="No message")
            status_str = "APPROVED" if success else "REJECTED"
            print(f"\n[{self.node_name}] Handshake {status_str}! Remote message: {message}")
        except Exception as e:
            print(f"[{self.node_name}] Error reading handshake ack: {e}")

    def on_text(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            sender = reader.get_string(KEY_SENDER_NAME, default="Unknown Peer")
            message = reader.get_string(KEY_TEXT_MESSAGE)
            print(f"\n[{self.node_name} Message] {sender}: {message}")
        except Exception as e:
            print(f"[{self.node_name}] Error parsing text packet: {e}")

    def on_file_start(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)
            file_name = reader.get_string(KEY_FILE_NAME)
            file_size = reader.get_long(KEY_FILE_SIZE)
            chunk_size = reader.get_int(KEY_CHUNK_SIZE)

            print(f"\n[{self.node_name}] Incoming File Stream:")
            print(f"  Transfer ID: {transfer_id}")
            print(f"  File Name: {file_name}")
            print(f"  Total Size: {file_size} bytes")
            print(f"  Chunk Size: {chunk_size} bytes")

            transfer = ActiveTransfer(transfer_id, file_name, file_size, chunk_size, self.node_name)
            save_path = os.path.join("received_files", f"{self.node_name}_{transfer.file_name}")
            
            # Open the file for binary write
            transfer.file_ref = open(save_path, "wb")
            self.active_transfers[transfer_id] = transfer
            print(f"[{self.node_name}] File created at: {save_path}. Waiting for chunks...")
        except Exception as e:
            print(f"[{self.node_name}] Error initiating file download: {e}")

    def on_file_chunk(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)
            chunk_num = reader.get_int(KEY_CHUNK_NUMBER)
            binary_data = reader.get_bytes(KEY_BINARY_DATA)

            if transfer_id not in self.active_transfers:
                print(f"\n[{self.node_name}] Error: Chunk received for inactive transfer ID {transfer_id}")
                return

            transfer = self.active_transfers[transfer_id]
            if transfer.file_ref:
                transfer.file_ref.write(binary_data)
                transfer.bytes_received += len(binary_data)
                transfer.chunks_received += 1
                
                pct = (transfer.bytes_received / transfer.file_size) * 100 if transfer.file_size > 0 else 100
                print(f"  [{self.node_name}] Chunk #{chunk_num} written: {len(binary_data)} bytes ({pct:.1f}% complete)", end="\r")
        except Exception as e:
            print(f"\n[{self.node_name}] Error writing file chunk: {e}")

    def on_file_end(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)

            if transfer_id not in self.active_transfers:
                print(f"\n[{self.node_name}] Error: FILE_END received for inactive transfer ID {transfer_id}")
                return

            transfer = self.active_transfers[transfer_id]
            if transfer.file_ref:
                transfer.file_ref.close()
                transfer.file_ref = None

            print(f"\n[{self.node_name}] File assembly completed!")
            print(f"  Saved file: '{self.node_name}_{transfer.file_name}' to 'received_files/' directory.")
            print(f"  Total size: {transfer.bytes_received} bytes in {transfer.chunks_received} chunks.")
            del self.active_transfers[transfer_id]
        except Exception as e:
            print(f"\n[{self.node_name}] Error completing file transfer: {e}")

    def on_ping(self, connection, packet: Packet) -> None:
        print(f"\n[{self.node_name}] Received PING heartbeat. Responding with PONG.")
        pong_packet = Packet(PacketType.PONG)
        connection.send_packet(pong_packet)

    def on_pong(self, connection, packet: Packet) -> None:
        print(f"\n[{self.node_name}] Received PONG heartbeat confirmation.")

    def on_disconnect(self, connection, packet: Packet) -> None:
        print(f"\n[{self.node_name}] Remote peer disconnected.")
        # Clean up any incomplete files
        for tid, transfer in list(self.active_transfers.items()):
            if transfer.file_ref:
                transfer.file_ref.close()
                try:
                    os.remove(os.path.join("received_files", f"{self.node_name}_{transfer.file_name}"))
                except OSError:
                    pass
            del self.active_transfers[tid]
