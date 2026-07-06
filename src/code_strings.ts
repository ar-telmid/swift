export interface CodeFile {
  name: string;
  description: string;
  code: string;
}

export const pythonCodeFiles: CodeFile[] = [
  {
    name: "constants.py",
    description: "Contains numerical markers, field key mappings, default port allocations, and socket buffer sizes.",
    code: `"""
Constants for the custom binary TCP protocol.
This file contains the marker definitions, field key mappings, and port defaults.
"""

# Protocol Markers
FIELD_MARKER = 0x00  # The single byte marker used to validate each field boundary

# Handshake Field Keys
KEY_DEVICE_NAME = 0x01
KEY_APP_NAME = 0x02
KEY_APP_VERSION = 0x03
KEY_PLATFORM = 0x04
KEY_PROTOCOL_VERSION = 0x05

# File Transfer Field Keys
KEY_TRANSFER_ID = 0x0A      # 10
KEY_FILE_NAME = 0x0B        # 11
KEY_FILE_SIZE = 0x0C        # 12
KEY_CHUNK_SIZE = 0x0D       # 13
KEY_CHUNK_NUMBER = 0x0E     # 14
KEY_BINARY_DATA = 0x0F      # 15

# Chat / General Field Keys
KEY_TEXT_MESSAGE = 0x14     # 20
KEY_SENDER_NAME = 0x15      # 21

# Default Connection Settings
DEFAULT_PORT = 9999
BUFFER_SIZE = 4096
`
  },
  {
    name: "packet_types.py",
    description: "Defines the 1-byte packet type identifiers via a standard IntEnum.",
    code: `from enum import IntEnum

class PacketType(IntEnum):
    """
    Supported Packet Types in the Custom Binary TCP Protocol.
    Each packet type is represented by a unique 1-byte identifier.
    """
    HANDSHAKE = 0x01
    HANDSHAKE_ACK = 0x02
    TEXT = 0x03
    FILE_START = 0x04
    FILE_CHUNK = 0x05
    FILE_END = 0x06
    PING = 0x07
    PONG = 0x08
    DISCONNECT = 0x09

    @classmethod
    def has_value(cls, value: int) -> bool:
        """Helper to verify if an integer corresponds to a valid packet type."""
        return value in cls._value2member_map_
`
  },
  {
    name: "field.py",
    description: "Represents a single binary payload field, complete with serialize operations.",
    code: `from typing import Any
import struct
from constants import FIELD_MARKER

class Field:
    """
    Represents a single binary field in a packet payload.
    
    Structure:
    - Marker: 1 byte (0x00)
    - Key: 1 byte (0-255)
    - Length: 2 bytes unsigned (big-endian)
    - Value: variable length bytes
    """

    def __init__(self, key: int, value: bytes):
        """
        Initialize a Field with a key and binary value.
        
        :param key: The unique field identifier (1 byte)
        :param value: The binary data content of the field
        """
        if not (0 <= key <= 255):
            raise ValueError("Field key must be a single byte (0-255).")
        
        self.key: int = key
        self.value: bytes = value

    @property
    def length(self) -> int:
        """Returns the length of the binary value (must be <= 65535)."""
        return len(self.value)

    def serialize(self) -> bytes:
        """
        Serialize this field into its custom binary format.
        
        Format: [Marker (1B)][Key (1B)][Length (2B, Big-Endian)][Value (NB)]
        """
        val_len = self.length
        if val_len > 65535:
            raise ValueError(f"Field value length ({val_len}) exceeds 16-bit unsigned limit (65535).")
            
        header = struct.pack(">BBH", FIELD_MARKER, self.key, val_len)
        return header + self.value

    def __repr__(self) -> str:
        return f"Field(key={self.key:#04x}, length={self.length}, value={self.value[:30]!r})"
`
  },
  {
    name: "field_writer.py",
    description: "Builds a binary payload by packing strings, shorts, integers, longs, booleans, and raw bytes into a continuous bytearray.",
    code: `import struct
from typing import Union
from field import Field

class FieldWriter:
    """
    Builder-style writer for constructing custom binary packet payloads.
    
    Internally builds a bytearray of serialized fields.
    Each field is written in the custom format:
    [Marker (1B)][Key (1B)][Length (2B, Big-Endian)][Value (NB)]
    """

    def __init__(self):
        """Initialize an empty field writer."""
        self._buffer = bytearray()

    def _write_field(self, key: int, value: bytes) -> "FieldWriter":
        """Helper to serialize and append a Field to the internal buffer."""
        field = Field(key, value)
        self._buffer.extend(field.serialize())
        return self

    def write_string(self, key: int, value: str) -> "FieldWriter":
        """Write a string field encoded in UTF-8."""
        encoded = value.encode('utf-8')
        return self._write_field(key, encoded)

    def write_bytes(self, key: int, value: Union[bytes, bytearray]) -> "FieldWriter":
        """Write a raw bytes field."""
        return self._write_field(key, bytes(value))

    def write_short(self, key: int, value: int) -> "FieldWriter":
        """Write a 16-bit signed integer (short) in big-endian format."""
        encoded = struct.pack(">h", value)
        return self._write_field(key, encoded)

    def write_int(self, key: int, value: int) -> "FieldWriter":
        """Write a 32-bit signed integer in big-endian format."""
        encoded = struct.pack(">i", value)
        return self._write_field(key, encoded)

    def write_long(self, key: int, value: int) -> "FieldWriter":
        """Write a 64-bit signed integer (long) in big-endian format."""
        encoded = struct.pack(">q", value)
        return self._write_field(key, encoded)

    def write_boolean(self, key: int, value: bool) -> "FieldWriter":
        """Write a boolean field as a single byte (1 for True, 0 for False)."""
        encoded = struct.pack(">?", value)
        return self._write_field(key, encoded)

    def get_bytes(self) -> bytes:
        """Get the accumulated binary payload bytes."""
        return bytes(self._buffer)

    def clear(self) -> None:
        """Clear the internal buffer for reuse."""
        self._buffer.clear()
`
  },
  {
    name: "field_reader.py",
    description: "Parses payloads byte-by-byte, validates markers, reads variable values, and offers high-level type getters.",
    code: `import struct
from typing import Dict, Optional
from constants import FIELD_MARKER

class FieldReader:
    """
    Parser for custom binary packet payloads.
    
    Reads field structures from raw bytes, validates each FIELD_MARKER,
    and indexes fields into a dictionary for fast lookup.
    """

    def __init__(self, payload_bytes: bytes):
        """
        Parse raw payload bytes into fields.
        
        :param payload_bytes: The continuous binary payload of a packet
        :raises ValueError: If marker validation fails or the packet is malformed
        """
        self._fields: Dict[int, bytes] = {}
        self._parse(payload_bytes)

    def _parse(self, payload_bytes: bytes) -> None:
        """Parse raw payload bytes, validating markers and populating fields."""
        offset = 0
        total_len = len(payload_bytes)

        while offset < total_len:
            # We need at least 4 bytes for Marker (1B), Key (1B), and Length (2B)
            if total_len - offset < 4:
                raise ValueError("Malformed payload: Header truncated.")

            marker, key, val_len = struct.unpack_from(">BBH", payload_bytes, offset)
            offset += 4

            if marker != FIELD_MARKER:
                raise ValueError(f"Marker validation failed. Expected {FIELD_MARKER:#04x}, got {marker:#04x} at offset {offset-4}.")

            if total_len - offset < val_len:
                raise ValueError(f"Malformed payload: Expected field value of length {val_len}, but only {total_len - offset} bytes remain.")

            val_bytes = payload_bytes[offset : offset + val_len]
            offset += val_len

            # Store the raw binary value mapped by the field's key
            self._fields[key] = val_bytes

    def has_field(self, key: int) -> bool:
        """Check if a field exists in the parsed payload."""
        return key in self._fields

    def get_bytes(self, key: int, default: Optional[bytes] = None) -> bytes:
        """Retrieve the raw binary value of a field."""
        if key not in self._fields:
            if default is not None:
                return default
            raise KeyError(f"Field key {key:#04x} not found in parsed payload.")
        return self._fields[key]

    def get_string(self, key: int, default: Optional[str] = None) -> str:
        """Retrieve and decode a string field (UTF-8)."""
        try:
            raw_bytes = self.get_bytes(key)
            return raw_bytes.decode('utf-8')
        except KeyError:
            if default is not None:
                return default
            raise

    def get_short(self, key: int, default: Optional[int] = None) -> int:
        """Retrieve and decode a 16-bit signed short integer."""
        try:
            raw_bytes = self.get_bytes(key)
            if len(raw_bytes) != 2:
                raise ValueError(f"Invalid short length: expected 2, got {len(raw_bytes)}")
            return struct.unpack(">h", raw_bytes)[0]
        except KeyError:
            if default is not None:
                return default
            raise

    def get_int(self, key: int, default: Optional[int] = None) -> int:
        """Retrieve and decode a 32-bit signed integer."""
        try:
            raw_bytes = self.get_bytes(key)
            if len(raw_bytes) != 4:
                raise ValueError(f"Invalid int length: expected 4, got {len(raw_bytes)}")
            return struct.unpack(">i", raw_bytes)[0]
        except KeyError:
            if default is not None:
                return default
            raise

    def get_long(self, key: int, default: Optional[int] = None) -> int:
        """Retrieve and decode a 64-bit signed long integer."""
        try:
            raw_bytes = self.get_bytes(key)
            if len(raw_bytes) != 8:
                raise ValueError(f"Invalid long length: expected 8, got {len(raw_bytes)}")
            return struct.unpack(">q", raw_bytes)[0]
        except KeyError:
            if default is not None:
                return default
            raise

    def get_boolean(self, key: int, default: Optional[bool] = None) -> bool:
        """Retrieve and decode a boolean field."""
        try:
            raw_bytes = self.get_bytes(key)
            if len(raw_bytes) != 1:
                raise ValueError(f"Invalid boolean length: expected 1, got {len(raw_bytes)}")
            return struct.unpack(">?", raw_bytes)[0]
        except KeyError:
            if default is not None:
                return default
            raise
`
  },
  {
    name: "packet.py",
    description: "Specifies the fixed header formatting (1-byte type + 2-byte payload length) and provides streaming recv/send methods.",
    code: `import struct
import socket
from typing import Union
from packet_types import PacketType

class Packet:
    """
    Represents a full custom binary TCP packet.
    
    Format:
    - Packet Type: 1 byte
    - Payload Length: 2 bytes unsigned (big-endian)
    - Payload: variable length bytes
    """

    HEADER_SIZE = 3  # 1 byte for Type, 2 bytes for Payload Length

    def __init__(self, packet_type: Union[int, PacketType], payload: bytes = b""):
        """
        Initialize a Packet.
        
        :param packet_type: The 1-byte identifier of the packet type
        :param payload: The binary payload data (default empty)
        """
        if isinstance(packet_type, PacketType):
            self.packet_type: int = packet_type.value
        else:
            self.packet_type = int(packet_type)

        if not (0 <= self.packet_type <= 255):
            raise ValueError("Packet type must be a single byte (0-255).")
            
        self.payload: bytes = payload

        if len(self.payload) > 65535:
            raise ValueError(f"Packet payload length ({len(self.payload)}) exceeds 16-bit unsigned limit (65535).")

    @property
    def payload_length(self) -> int:
        """Returns the length of the payload."""
        return len(self.payload)

    def serialize(self) -> bytes:
        """
        Serialize the packet to its raw binary representation.
        
        Format: [Type (1B)][Length (2B, Big-Endian)][Payload (NB)]
        """
        header = struct.pack(">BH", self.packet_type, self.payload_length)
        return header + self.payload

    @classmethod
    def from_bytes(cls, data: bytes) -> "Packet":
        """
        Parse a Packet from raw bytes.
        
        :param data: The serialized binary packet data
        :return: A Packet instance
        """
        if len(data) < cls.HEADER_SIZE:
            raise ValueError("Insufficient bytes to parse packet header.")

        packet_type, payload_length = struct.unpack_from(">BH", data, 0)
        
        if len(data) < cls.HEADER_SIZE + payload_length:
            raise ValueError(f"Truncated packet: Header specifies payload of {payload_length} bytes, but only {len(data) - cls.HEADER_SIZE} are available.")

        payload = data[cls.HEADER_SIZE : cls.HEADER_SIZE + payload_length]
        return cls(packet_type, payload)

    @classmethod
    def receive_from_socket(cls, sock: socket.socket) -> "Packet":
        """
        Helper method to block and read a single complete Packet from a socket.
        
        :param sock: The connected TCP socket
        :return: A Packet instance
        :raises ConnectionError: If the socket is closed or disconnected
        """
        # 1. Read fixed header (3 bytes)
        header_bytes = cls._read_exact(sock, cls.HEADER_SIZE)
        if not header_bytes:
            raise ConnectionError("Socket closed while reading packet header.")

        packet_type, payload_length = struct.unpack(">BH", header_bytes)

        # 2. Read exactly payload_length bytes
        payload_bytes = b""
        if payload_length > 0:
            payload_bytes = cls._read_exact(sock, payload_length)
            if len(payload_bytes) < payload_length:
                raise ConnectionError("Socket closed while reading packet payload.")

        return cls(packet_type, payload_bytes)

    @staticmethod
    def _read_exact(sock: socket.socket, num_bytes: int) -> bytes:
        """Utility to read exactly num_bytes from a TCP socket stream."""
        buffer = bytearray()
        while len(buffer) < num_bytes:
            remaining = num_bytes - len(buffer)
            try:
                chunk = sock.recv(remaining)
                if not chunk:
                    # Connection closed
                    break
                buffer.extend(chunk)
            except (socket.error, ConnectionResetError) as e:
                raise ConnectionError(f"Connection reset/error during receive: {e}")
        return bytes(buffer)

    def __repr__(self) -> str:
        # Resolve to Enum name if possible for cleaner debug
        try:
            pt_name = PacketType(self.packet_type).name
        except ValueError:
            pt_name = f"UNKNOWN({self.packet_type})"
            
        return f"Packet(type={pt_name}, length={self.payload_length})"
`
  },
  {
    name: "dispatcher.py",
    description: "An event-driven packet router containing virtual handler methods and the full, symmetric PeerDispatcher for identical bidirectional capabilities.",
    code: `import os
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
    """

    def dispatch(self, connection, packet: Packet) -> None:
        """
        Dispatches a packet to its designated callback.
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
        pass

    def on_handshake_ack(self, connection, packet: Packet) -> None:
        pass

    def on_text(self, connection, packet: Packet) -> None:
        pass

    def on_file_start(self, connection, packet: Packet) -> None:
        pass

    def on_file_chunk(self, connection, packet: Packet) -> None:
        pass

    def on_file_end(self, connection, packet: Packet) -> None:
        pass

    def on_ping(self, connection, packet: Packet) -> None:
        pass

    def on_pong(self, connection, packet: Packet) -> None:
        pass

    def on_disconnect(self, connection, packet: Packet) -> None:
        pass


class ActiveTransfer:
    """Tracks file download states on a peer."""
    def __init__(self, transfer_id: int, file_name: str, file_size: int, chunk_size: int, node_name: str):
        self.transfer_id = transfer_id
        self.file_name = os.path.basename(file_name)
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

            print(f"\\n[{self.node_name}] Received HANDSHAKE from remote peer:")
            print(f"  Device: {dev_name} ({platform})")
            print(f"  App: {app_name} v{app_ver}")
            print(f"  Protocol Version: {proto_ver}")

            # Send HANDSHAKE_ACK back
            writer = FieldWriter()
            writer.write_boolean(0x01, True)
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
            print(f"\\n[{self.node_name}] Handshake {status_str}! Remote message: {message}")
        except Exception as e:
            print(f"[{self.node_name}] Error reading handshake ack: {e}")

    def on_text(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            sender = reader.get_string(KEY_SENDER_NAME, default="Unknown Peer")
            message = reader.get_string(KEY_TEXT_MESSAGE)
            print(f"\\n[{self.node_name} Message] {sender}: {message}")
        except Exception as e:
            print(f"[{self.node_name}] Error parsing text packet: {e}")

    def on_file_start(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)
            file_name = reader.get_string(KEY_FILE_NAME)
            file_size = reader.get_long(KEY_FILE_SIZE)
            chunk_size = reader.get_int(KEY_CHUNK_SIZE)

            print(f"\\n[{self.node_name}] Incoming File Stream:")
            print(f"  Transfer ID: {transfer_id}")
            print(f"  File Name: {file_name}")
            print(f"  Total Size: {file_size} bytes")
            print(f"  Chunk Size: {chunk_size} bytes")

            transfer = ActiveTransfer(transfer_id, file_name, file_size, chunk_size, self.node_name)
            save_path = os.path.join("received_files", f"{self.node_name}_{transfer.file_name}")
            
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
                print(f"\\n[{self.node_name}] Error: Chunk received for inactive transfer ID {transfer_id}")
                return

            transfer = self.active_transfers[transfer_id]
            if transfer.file_ref:
                transfer.file_ref.write(binary_data)
                transfer.bytes_received += len(binary_data)
                transfer.chunks_received += 1
                
                pct = (transfer.bytes_received / transfer.file_size) * 100 if transfer.file_size > 0 else 100
                print(f"  [{self.node_name}] Chunk #{chunk_num} written: {len(binary_data)} bytes ({pct:.1f}% complete)", end="\\r")
        except Exception as e:
            print(f"\\n[{self.node_name}] Error writing file chunk: {e}")

    def on_file_end(self, connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)

            if transfer_id not in self.active_transfers:
                print(f"\\n[{self.node_name}] Error: FILE_END received for inactive transfer ID {transfer_id}")
                return

            transfer = self.active_transfers[transfer_id]
            if transfer.file_ref:
                transfer.file_ref.close()
                transfer.file_ref = None

            print(f"\\n[{self.node_name}] File assembly completed!")
            print(f"  Saved file: '{self.node_name}_{transfer.file_name}' to 'received_files/' directory.")
            print(f"  Total size: {transfer.bytes_received} bytes in {transfer.chunks_received} chunks.")
            del self.active_transfers[transfer_id]
        except Exception as e:
            print(f"\\n[{self.node_name}] Error completing file transfer: {e}")

    def on_ping(self, connection, packet: Packet) -> None:
        print(f"\\n[{self.node_name}] Received PING heartbeat. Responding with PONG.")
        pong_packet = Packet(PacketType.PONG)
        connection.send_packet(pong_packet)

    def on_pong(self, connection, packet: Packet) -> None:
        print(f"\\n[{self.node_name}] Received PONG heartbeat confirmation.")

    def on_disconnect(self, connection, packet: Packet) -> None:
        print(f"\\n[{self.node_name}] Remote peer disconnected.")
        # Cleanup incomplete files
        for tid, transfer in list(self.active_transfers.items()):
            if transfer.file_ref:
                transfer.file_ref.close()
                try:
                    os.remove(os.path.join("received_files", f"{self.node_name}_{transfer.file_name}"))
                except OSError:
                    pass
            del self.active_transfers[tid]
`
  },
  {
    name: "connection.py",
    description: "Maintains a persistent, thread-safe session with background parsing threads and writing synchronization locks.",
    code: `import socket
import threading
from typing import Optional
from packet import Packet
from dispatcher import Dispatcher

class Connection:
    """
    Manages a single persistent, thread-safe TCP socket connection.
    Identical for both peers, receiving an already connected socket.
    """

    def __init__(self, sock: socket.socket, dispatcher: Dispatcher):
        """
        Initialize a connection with an already connected socket and a dispatcher.
        """
        self.sock: socket.socket = sock
        self.dispatcher: Dispatcher = dispatcher
        self._is_running: bool = True
        self._send_lock = threading.Lock()  # Prevent simultaneous writes
        
        # Start background receiver thread executing the receive_loop
        self._read_thread = threading.Thread(
            target=self.receive_loop, 
            name="Connection-Receiver", 
            daemon=True
        )
        self._read_thread.start()

    def send_packet(self, packet: Packet) -> None:
        """
        Send a Packet over the TCP socket in a thread-safe manner.
        Can be safely called from any thread.
        """
        serialized = packet.serialize()
        with self._send_lock:
            if not self._is_running:
                raise ConnectionError("Cannot send: Connection is not active.")
            try:
                self.sock.sendall(serialized)
            except socket.error as e:
                self.close()
                raise ConnectionError(f"Failed to transmit packet: {e}")

    def receive_loop(self) -> None:
        """
        Continuous reading loop executed inside a dedicated background thread.
        """
        try:
            while self._is_running:
                # Blocks until a complete packet is received
                packet = Packet.receive_from_socket(self.sock)
                # Dispatch the packet to our handler
                self.dispatcher.dispatch(self, packet)
        except ConnectionError:
            pass
        except Exception as e:
            print(f"[Connection] Error in receiver loop: {e}")
        finally:
            self.close()
            from packet_types import PacketType
            disconnect_packet = Packet(PacketType.DISCONNECT)
            self.dispatcher.dispatch(self, disconnect_packet)

    def close(self) -> None:
        """Close the socket and stop the background receiver thread."""
        if not self._is_running:
            return

        self._is_running = False
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except socket.error:
            pass

        try:
            self.sock.close()
        except socket.error:
            pass

        if self._read_thread and threading.current_thread() != self._read_thread:
            self._read_thread.join(timeout=1.0)

    @property
    def is_active(self) -> bool:
        """Check if the connection is currently active."""
        return self._is_running
`
  }
];

export const kotlinCodeFiles: CodeFile[] = [
  {
    name: "Protocol.kt",
    description: "The main public API singleton for Android developers. Manages background execution of client/server threads and handles main-thread UI callbacks.",
    code: `package com.bouazza.swift.protocol

import android.os.Handler
import android.os.Looper
import com.bouazza.swift.protocol.callbacks.ProtocolListener
import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.dispatcher.Dispatcher
import com.bouazza.swift.protocol.session.Session
import com.bouazza.swift.protocol.transport.TcpTransport
import com.bouazza.swift.protocol.transfer.TransferManager
import java.io.File
import java.io.IOException
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

/**
 * Main entry point and public API for the Swift peer-to-peer binary protocol.
 */
object Protocol {
    private val executor = Executors.newCachedThreadPool()
    private val mainThreadHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var activeSession: Session? = null

    @Volatile
    private var serverSocket: ServerSocket? = null

    /**
     * Symmetrically starts a background listening socket to accept exactly one connection.
     */
    fun startListening(port: Int, listener: ProtocolListener, nodeName: String) {
        if (activeSession != null) {
            postError(listener, IllegalStateException("Protocol session is already active."))
            return
        }

        executor.execute {
            try {
                val sSocket = ServerSocket(port).also { serverSocket = it }
                val socket = sSocket.accept()
                sSocket.close()
                serverSocket = null

                initializePeer(socket, listener, nodeName)
            } catch (e: Exception) {
                if (activeSession == null) {
                    postError(listener, e)
                }
            }
        }
    }

    /**
     * Symmetrically connects to a remote host in the background.
     */
    fun connect(host: String, port: Int, listener: ProtocolListener, nodeName: String) {
        if (activeSession != null) {
            postError(listener, IllegalStateException("Protocol session is already active."))
            return
        }

        executor.execute {
            try {
                val transport = TcpTransport(host, port)
                initializePeer(transport, listener, nodeName)
            } catch (e: Exception) {
                postError(listener, e)
            }
        }
    }

    private fun initializePeer(socket: Socket, listener: ProtocolListener, nodeName: String) {
        val transport = TcpTransport(socket)
        initializePeer(transport, listener, nodeName)
    }

    private fun initializePeer(transport: TcpTransport, listener: ProtocolListener, nodeName: String) {
        val safeListener = MainThreadListenerProxy(listener, mainThreadHandler)
        val dispatcher = Dispatcher()
        val transferManager = TransferManager(safeListener)

        val connection = Connection(
            transport = transport,
            incomingPacketCallback = { packet ->
                activeSession?.let { dispatcher.dispatch(it.connection, packet) }
            },
            disconnectCallback = {
                activeSession = null
                safeListener.onDisconnected()
            }
        )

        activeSession = Session(connection, dispatcher, transferManager, safeListener, nodeName)
        safeListener.onConnected("peer", 9999)
    }

    /**
     * Gracefully notifies the remote peer and disconnects.
     */
    fun disconnect() {
        val session = activeSession ?: return
        activeSession = null
        
        executor.execute {
            session.sendDisconnect()
        }

        try {
            serverSocket?.close()
            serverSocket = null
        } catch (ignored: Exception) {}
    }

    /**
     * Transmits a text chat message to the remote peer.
     */
    fun sendText(senderName: String, text: String) {
        val session = activeSession ?: throw IllegalStateException("Not connected to any peer.")
        executor.execute {
            session.sendText(senderName, text)
        }
    }

    /**
     * Slices and streams a local binary file over the peer-to-peer session.
     */
    fun sendFile(file: File, chunkSize: Int = 4096) {
        val session = activeSession ?: throw IllegalStateException("Not connected to any peer.")
        try {
            val transferManagerField = Session::class.java.getDeclaredField("transferManager")
            transferManagerField.isAccessible = true
            val transferManager = transferManagerField.get(session) as TransferManager
            transferManager.startOutgoingTransfer(session.connection, file, chunkSize)
        } catch (e: Exception) {
            throw IllegalStateException("Failed to coordinate file transmission: \${e.message}", e)
        }
    }

    private fun postError(listener: ProtocolListener, exception: Exception) {
        mainThreadHandler.post { listener.onError(exception) }
    }

    private class MainThreadListenerProxy(
        private val delegate: ProtocolListener,
        private val handler: Handler
    ) : ProtocolListener {
        override fun onConnected(host: String, port: Int) {
            handler.post { delegate.onConnected(host, port) }
        }

        override fun onDisconnected() {
            handler.post { delegate.onDisconnected() }
        }

        override fun onHandshake(deviceName: String, appName: String, appVersion: String, platform: String, protocolVersion: Short, capabilities: String) {
            handler.post { delegate.onHandshake(deviceName, appName, appVersion, platform, protocolVersion, capabilities) }
        }

        override fun onTextReceived(sender: String, text: String) {
            handler.post { delegate.onTextReceived(sender, text) }
        }

        override fun onFileStarted(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {
            handler.post { delegate.onFileStarted(transferId, fileName, fileSize, chunkSize) }
        }

        override fun onFileProgress(transferId: Int, bytesTransferred: Long, totalBytes: Long, percentage: Double, speedBytesPerSec: Long, estimatedRemainingSeconds: Long) {
            handler.post { delegate.onFileProgress(transferId, bytesTransferred, totalBytes, percentage, speedBytesPerSec, estimatedRemainingSeconds) }
        }

        override fun onFileCompleted(transferId: Int, fileName: String, totalBytesReceived: Long, savePath: String) {
            handler.post { delegate.onFileCompleted(transferId, fileName, totalBytesReceived, savePath) }
        }

        override fun onFileCancelled(transferId: Int) {
            handler.post { delegate.onFileCancelled(transferId) }
        }

        override fun onError(exception: Exception) {
            handler.post { delegate.onError(exception) }
        }
    }
}
`
  },
  {
    name: "Transport.kt",
    description: "The transport abstraction layer interface that decouples raw bidirectional byte streaming from higher-level protocol packing.",
    code: `package com.bouazza.swift.protocol.transport

import java.io.IOException

/**
 * Interface abstracting raw bidirectional network stream transmissions.
 */
interface Transport {
    val isActive: Boolean

    @Throws(IOException::class)
    fun write(data: ByteArray)

    @Throws(IOException::class)
    fun read(buffer: ByteArray, offset: Int, length: Int): Int

    @Throws(IOException::class)
    fun flush()

    fun close()
}
`
  },
  {
    name: "TcpTransport.kt",
    description: "Concrete TCP socket implementation of the Transport interface supporting buffered I/O streams.",
    code: `package com.bouazza.swift.protocol.transport

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket

class TcpTransport : Transport {
    private val socket: Socket
    private val inputStream: BufferedInputStream
    private val outputStream: BufferedOutputStream
    
    @Volatile
    private var isClosed = false

    constructor(socket: Socket) {
        this.socket = socket
        this.inputStream = BufferedInputStream(socket.getInputStream())
        this.outputStream = BufferedOutputStream(socket.getOutputStream())
    }

    constructor(host: String, port: Int, connectionTimeoutMs: Int = 10000) {
        this.socket = Socket()
        this.socket.connect(InetSocketAddress(host, port), connectionTimeoutMs)
        this.inputStream = BufferedInputStream(socket.getInputStream())
        this.outputStream = BufferedOutputStream(socket.getOutputStream())
    }

    override val isActive: Boolean
        get() = !isClosed && socket.isConnected && !socket.isClosed && !socket.isInputShutdown && !socket.isOutputShutdown

    @Throws(IOException::class)
    override fun write(data: ByteArray) {
        if (!isActive) throw IOException("Cannot write: TCP transport is not active.")
        outputStream.write(data)
    }

    @Throws(IOException::class)
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (!isActive) throw IOException("Cannot read: TCP transport is not active.")
        
        var totalBytesRead = 0
        while (totalBytesRead < length) {
            val bytesRead = inputStream.read(buffer, offset + totalBytesRead, length - totalBytesRead)
            if (bytesRead == -1) {
                if (totalBytesRead == 0) return -1
                throw IOException("End of stream reached before reading expected length: \$length")
            }
            totalBytesRead += bytesRead
        }
        return totalBytesRead
    }

    @Throws(IOException::class)
    override fun flush() {
        if (isActive) {
            outputStream.flush()
        }
    }

    override fun close() {
        if (isClosed) return
        isClosed = true
        
        try { socket.shutdownInput() } catch (ignored: Exception) {}
        try { socket.shutdownOutput() } catch (ignored: Exception) {}
        try { inputStream.close() } catch (ignored: Exception) {}
        try { outputStream.close() } catch (ignored: Exception) {}
        try { socket.close() } catch (ignored: Exception) {}
    }
}
`
  },
  {
    name: "Connection.kt",
    description: "Maintains a full-duplex session over a Transport. Manages a dedicated background thread for packet reading and exposes safe synchronous writers.",
    code: `package com.bouazza.swift.protocol.connection

import com.bouazza.swift.protocol.packet.Packet
import com.bouazza.swift.protocol.packet.PacketReader
import com.bouazza.swift.protocol.packet.PacketWriter
import com.bouazza.swift.protocol.transport.Transport
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean

class Connection(
    private val transport: Transport,
    private val incomingPacketCallback: (Packet) -> Unit,
    private val disconnectCallback: () -> Unit
) {
    private val packetReader = PacketReader(transport)
    private val packetWriter = PacketWriter(transport)
    private val isRunning = AtomicBoolean(true)
    private var readThread: Thread? = null

    init {
        readThread = Thread({ receiveLoop() }, "SwiftConnection-Receiver").apply {
            isDaemon = true
            start()
        }
    }

    @Throws(IOException::class)
    fun sendPacket(packet: Packet) {
        if (!isActive) {
            throw IOException("Cannot send: connection is closed.")
        }
        packetWriter.writePacket(packet)
    }

    val isActive: Boolean
        get() = isRunning.get() && transport.isActive

    private fun receiveLoop() {
        try {
            while (isRunning.get() && transport.isActive) {
                val packet = packetReader.readPacket()
                incomingPacketCallback(packet)
            }
        } catch (ignored: IOException) {
        } finally {
            close()
        }
    }

    fun close() {
        if (!isRunning.compareAndSet(true, false)) {
            return
        }
        try { transport.close() } catch (ignored: Exception) {}
        disconnectCallback()
        readThread?.interrupt()
    }
}
`
  },
  {
    name: "Packet.kt",
    description: "Declares the logical frame structure for a protocol transmission, specifying header layouts and raw data offsets.",
    code: `package com.bouazza.swift.protocol.packet

import java.nio.ByteBuffer

class Packet(
    val type: Byte,
    val payload: ByteArray = ByteArray(0)
) {
    init {
        require(payload.size <= 65535) {
            "Packet payload size (\${payload.size}) exceeds 16-bit unsigned limit of 65535."
        }
    }

    constructor(packetType: PacketType, payload: ByteArray = ByteArray(0)) : this(packetType.value, payload)

    fun serialize(): ByteArray {
        val serialized = ByteArray(HEADER_SIZE + payload.size)
        val buffer = ByteBuffer.wrap(serialized)
        
        buffer.put(type)
        buffer.putShort(payload.size.toShort())
        buffer.put(payload)
        
        return serialized
    }

    companion object {
        const val HEADER_SIZE = 3
    }
}
`
  },
  {
    name: "PacketReader.kt",
    description: "Utility wrapper to pull exact-sized raw header headers and payloads synchronously from the transport stream.",
    code: `package com.bouazza.swift.protocol.packet

import com.bouazza.swift.protocol.transport.Transport
import java.io.IOException
import java.nio.ByteBuffer

class PacketReader(private val transport: Transport) {

    @Throws(IOException::class)
    fun readPacket(): Packet {
        val headerBuffer = ByteArray(Packet.HEADER_SIZE)
        val headerReadResult = transport.read(headerBuffer, 0, Packet.HEADER_SIZE)
        if (headerReadResult == -1) {
            throw IOException("Socket closed while reading packet header.")
        }

        val headerWrap = ByteBuffer.wrap(headerBuffer)
        val type = headerWrap.get()
        val payloadLength = headerWrap.getShort().toInt() and 0xFFFF

        val payloadBuffer = if (payloadLength > 0) {
            val buf = ByteArray(payloadLength)
            val payloadReadResult = transport.read(buf, 0, payloadLength)
            if (payloadReadResult == -1) {
                throw IOException("Socket closed while reading packet payload of length: \$payloadLength")
            }
            buf
        } else {
            ByteArray(0)
        }

        return Packet(type, payloadBuffer)
    }
}
`
  },
  {
    name: "PacketWriter.kt",
    description: "Ensures thread safety and prevent chunk interleaving when writing packets onto the shared socket output stream.",
    code: `package com.bouazza.swift.protocol.packet

import com.bouazza.swift.protocol.transport.Transport
import java.io.IOException

class PacketWriter(private val transport: Transport) {
    private val lock = Any()

    @Throws(IOException::class)
    fun writePacket(packet: Packet) {
        synchronized(lock) {
            val data = packet.serialize()
            transport.write(data)
            transport.flush()
        }
    }
}
`
  },
  {
    name: "Field.kt",
    description: "Represents a single Type-Length-Value payload segment matching the FIELD_MARKER protocol specification.",
    code: `package com.bouazza.swift.protocol.fields

import com.bouazza.swift.protocol.constants.ProtocolConstants
import java.nio.ByteBuffer

class Field(
    val key: Byte,
    val value: ByteArray
) {
    init {
        require(value.size <= 65535) {
            "Field value length (\${value.size}) exceeds 16-bit unsigned maximum limit of 65535."
        }
    }

    fun serialize(): ByteArray {
        val data = ByteArray(4 + value.size)
        val buffer = ByteBuffer.wrap(data)
        
        buffer.put(ProtocolConstants.FIELD_MARKER)
        buffer.put(key)
        buffer.putShort(value.size.toShort())
        buffer.put(value)
        
        return data
    }
}
`
  },
  {
    name: "FieldWriter.kt",
    description: "Streamlined binary builder following the Builder pattern to assemble string, integer, short, long, and boolean fields into TLV structures.",
    code: `package com.bouazza.swift.protocol.fields

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

class FieldWriter {
    private val outputStream = ByteArrayOutputStream()

    fun writeBytes(key: Byte, value: ByteArray): FieldWriter {
        val field = Field(key, value)
        try {
            outputStream.write(field.serialize())
        } catch (ignored: IOException) {}
        return this
    }

    fun writeString(key: Byte, value: String): FieldWriter {
        val bytes = value.toByteArray(StandardCharsets.UTF_8)
        return writeBytes(key, bytes)
    }

    fun writeShort(key: Byte, value: Short): FieldWriter {
        val buffer = ByteBuffer.allocate(2).putShort(value)
        return writeBytes(key, buffer.array())
    }

    fun writeInt(key: Byte, value: Int): FieldWriter {
        val buffer = ByteBuffer.allocate(4).putInt(value)
        return writeBytes(key, buffer.array())
    }

    fun writeLong(key: Byte, value: Long): FieldWriter {
        val buffer = ByteBuffer.allocate(8).putLong(value)
        return writeBytes(key, buffer.array())
    }

    fun writeBoolean(key: Byte, value: Boolean): FieldWriter {
        val byteVal = if (value) 1.toByte() else 0.toByte()
        return writeBytes(key, byteArrayOf(byteVal))
    }

    fun getBytes(): ByteArray {
        return outputStream.toByteArray()
    }

    fun clear() {
        outputStream.reset()
    }
}
`
  },
  {
    name: "FieldReader.kt",
    description: "Continuous payload parser validating bounds and converting binary field elements into typed getters.",
    code: `package com.bouazza.swift.protocol.fields

import com.bouazza.swift.protocol.constants.ProtocolConstants
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

class FieldReader(payload: ByteArray) {
    private val fields = HashMap<Byte, ByteArray>()

    init {
        parse(payload)
    }

    @Throws(IOException::class)
    private fun parse(payload: ByteArray) {
        val buffer = ByteBuffer.wrap(payload)
        while (buffer.hasRemaining()) {
            if (buffer.remaining() < 4) {
                throw IOException("Malformed payload: Header truncated.")
            }

            val marker = buffer.get()
            if (marker != ProtocolConstants.FIELD_MARKER) {
                throw IOException(String.format("Marker validation failed. Expected 0x00, got 0x%02X", marker))
            }

            val key = buffer.get()
            val length = buffer.getShort().toInt() and 0xFFFF

            if (buffer.remaining() < length) {
                throw IOException("Malformed payload: Declared field length (\$length) exceeds remaining buffer space.")
            }

            val valueBytes = ByteArray(length)
            buffer.get(valueBytes)
            fields[key] = valueBytes
        }
    }

    fun hasField(key: Byte): Boolean {
        return fields.containsKey(key)
    }

    fun getBytes(key: Byte): ByteArray {
        return fields[key] ?: throw NoSuchElementException("Field with key 0x\${String.format("%02X", key)} not found.")
    }

    fun getBytes(key: Byte, default: ByteArray): ByteArray {
        return fields[key] ?: default
    }

    fun getString(key: Byte): String {
        return String(getBytes(key), StandardCharsets.UTF_8)
    }

    fun getString(key: Byte, default: String): String {
        val bytes = fields[key] ?: return default
        return String(bytes, StandardCharsets.UTF_8)
    }

    fun getShort(key: Byte): Short {
        val bytes = getBytes(key)
        if (bytes.size != 2) throw IllegalArgumentException("Expected 2 bytes for Short, got \${bytes.size}.")
        return ByteBuffer.wrap(bytes).getShort()
    }

    fun getShort(key: Byte, default: Short): Short {
        val bytes = fields[key] ?: return default
        if (bytes.size != 2) return default
        return ByteBuffer.wrap(bytes).getShort()
    }

    fun getInt(key: Byte): Int {
        val bytes = getBytes(key)
        if (bytes.size != 4) throw IllegalArgumentException("Expected 4 bytes for Int, got \${bytes.size}.")
        return ByteBuffer.wrap(bytes).getInt()
    }

    fun getInt(key: Byte, default: Int): Int {
        val bytes = fields[key] ?: return default
        if (bytes.size != 4) return default
        return ByteBuffer.wrap(bytes).getInt()
    }

    fun getLong(key: Byte): Long {
        val bytes = getBytes(key)
        if (bytes.size != 8) throw IllegalArgumentException("Expected 8 bytes for Long, got \${bytes.size}.")
        return ByteBuffer.wrap(bytes).getLong()
    }

    fun getLong(key: Byte, default: Long): Long {
        val bytes = fields[key] ?: return default
        if (bytes.size != 8) return default
        return ByteBuffer.wrap(bytes).getLong()
    }

    fun getBoolean(key: Byte): Boolean {
        val bytes = getBytes(key)
        if (bytes.isEmpty()) throw IllegalArgumentException("Expected at least 1 byte for Boolean.")
        return bytes[0].toInt() != 0
    }

    fun getBoolean(key: Byte, default: Boolean): Boolean {
        val bytes = fields[key] ?: return default
        if (bytes.isEmpty()) return default
        return bytes[0].toInt() != 0
    }
}
`
  },
  {
    name: "Dispatcher.kt",
    description: "Event routing engine storing individual PacketHandlers to enable adding new packet types cleanly without modifying pre-compiled code.",
    code: `package com.bouazza.swift.protocol.dispatcher

import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.packet.Packet
import java.util.concurrent.ConcurrentHashMap

fun interface PacketHandler {
    fun handle(connection: Connection, packet: Packet)
}

class Dispatcher {
    private val handlers = ConcurrentHashMap<Byte, PacketHandler>()

    fun registerHandler(type: Byte, handler: PacketHandler) {
        handlers[type] = handler
    }

    fun unregisterHandler(type: Byte) {
        handlers.remove(type)
    }

    fun dispatch(connection: Connection, packet: Packet) {
        val handler = handlers[packet.type]
        if (handler != null) {
            try {
                handler.handle(connection, packet)
            } catch (e: Exception) {
                System.err.println("Error executing packet handler: \${e.message}")
            }
        }
    }
}
`
  },
  {
    name: "Session.kt",
    description: "Coordinates standard protocol handshake exchange, pings, text chats, and guides binary file assembly.",
    code: `package com.bouazza.swift.protocol.session

import com.bouazza.swift.protocol.callbacks.ProtocolListener
import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.constants.ProtocolConstants
import com.bouazza.swift.protocol.dispatcher.Dispatcher
import com.bouazza.swift.protocol.fields.FieldReader
import com.bouazza.swift.protocol.fields.FieldWriter
import com.bouazza.swift.protocol.packet.Packet
import com.bouazza.swift.protocol.packet.PacketType
import com.bouazza.swift.protocol.transfer.TransferManager
import java.io.IOException

class Session(
    val connection: Connection,
    private val dispatcher: Dispatcher,
    private val transferManager: TransferManager,
    private val listener: ProtocolListener,
    private val localNodeName: String
) {
    init {
        registerStandardHandlers()
        sendHandshake()
    }

    fun sendHandshake() {
        try {
            val payload = FieldWriter()
                .writeString(ProtocolConstants.KEY_DEVICE_NAME, localNodeName)
                .writeString(ProtocolConstants.KEY_APP_NAME, "SwiftP2PEngine")
                .writeString(ProtocolConstants.KEY_APP_VERSION, "1.0.0")
                .writeString(ProtocolConstants.KEY_PLATFORM, "Android API 33")
                .writeShort(ProtocolConstants.KEY_PROTOCOL_VERSION, 1)
                .writeString(ProtocolConstants.KEY_CAPABILITIES, "TEXT,FILE")
                .getBytes()

            connection.sendPacket(Packet(PacketType.HANDSHAKE, payload))
        } catch (e: Exception) {
            listener.onError(e)
        }
    }

    fun sendText(senderName: String, text: String) {
        try {
            val payload = FieldWriter()
                .writeString(ProtocolConstants.KEY_SENDER_NAME, senderName)
                .writeString(ProtocolConstants.KEY_TEXT_MESSAGE, text)
                .getBytes()

            connection.sendPacket(Packet(PacketType.TEXT, payload))
        } catch (e: Exception) {
            listener.onError(e)
        }
    }

    fun sendDisconnect() {
        try { connection.sendPacket(Packet(PacketType.DISCONNECT)) } catch (ignored: Exception) {}
        connection.close()
    }

    private fun registerStandardHandlers() {
        dispatcher.registerHandler(PacketType.HANDSHAKE.value) { conn, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val deviceName = reader.getString(ProtocolConstants.KEY_DEVICE_NAME)
                val appName = reader.getString(ProtocolConstants.KEY_APP_NAME)
                val appVersion = reader.getString(ProtocolConstants.KEY_APP_VERSION)
                val platform = reader.getString(ProtocolConstants.KEY_PLATFORM)
                val protocolVersion = reader.getShort(ProtocolConstants.KEY_PROTOCOL_VERSION)
                val capabilities = reader.getString(ProtocolConstants.KEY_CAPABILITIES, "")

                listener.onHandshake(deviceName, appName, appVersion, platform, protocolVersion, capabilities)

                val ackPayload = FieldWriter()
                    .writeBoolean(ProtocolConstants.KEY_HANDSHAKE_SUCCESS, true)
                    .writeString(ProtocolConstants.KEY_HANDSHAKE_MESSAGE, "Connection Approved by \$localNodeName")
                    .getBytes()

                conn.sendPacket(Packet(PacketType.HANDSHAKE_ACK, ackPayload))
            } catch (e: Exception) {
                listener.onError(IOException("Malformed handshake package received", e))
                conn.close()
            }
        }

        dispatcher.registerHandler(PacketType.HANDSHAKE_ACK.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val success = reader.getBoolean(ProtocolConstants.KEY_HANDSHAKE_SUCCESS)
                val message = reader.getString(ProtocolConstants.KEY_HANDSHAKE_MESSAGE)
                if (!success) {
                    listener.onError(IOException("Handshake was rejected by peer: \$message"))
                    connection.close()
                }
            } catch (e: Exception) {
                listener.onError(e)
            }
        }

        dispatcher.registerHandler(PacketType.TEXT.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val sender = reader.getString(ProtocolConstants.KEY_SENDER_NAME)
                val text = reader.getString(ProtocolConstants.KEY_TEXT_MESSAGE)
                listener.onTextReceived(sender, text)
            } catch (e: Exception) {
                listener.onError(e)
            }
        }

        dispatcher.registerHandler(PacketType.FILE_START.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val transferId = reader.getInt(ProtocolConstants.KEY_TRANSFER_ID)
                val fileName = reader.getString(ProtocolConstants.KEY_FILE_NAME)
                val fileSize = reader.getLong(ProtocolConstants.KEY_FILE_SIZE)
                val chunkSize = reader.getInt(ProtocolConstants.KEY_CHUNK_SIZE)
                
                transferManager.handleIncomingStart(transferId, fileName, fileSize, chunkSize)
            } catch (e: Exception) {
                listener.onError(e)
            }
        }

        dispatcher.registerHandler(PacketType.FILE_CHUNK.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val transferId = reader.getInt(ProtocolConstants.KEY_TRANSFER_ID)
                val chunkNumber = reader.getInt(ProtocolConstants.KEY_CHUNK_NUMBER)
                val data = reader.getBytes(ProtocolConstants.KEY_BINARY_DATA)
                
                transferManager.handleIncomingChunk(transferId, chunkNumber, data)
            } catch (e: Exception) {
                listener.onError(e)
            }
        }

        dispatcher.registerHandler(PacketType.FILE_END.value) { _, packet ->
            try {
                val reader = FieldReader(packet.payload)
                val transferId = reader.getInt(ProtocolConstants.KEY_TRANSFER_ID)
                transferManager.handleIncomingEnd(transferId)
            } catch (e: Exception) {
                listener.onError(e)
            }
        }

        dispatcher.registerHandler(PacketType.PING.value) { conn, _ ->
            try { conn.sendPacket(Packet(PacketType.PONG)) } catch (ignored: Exception) {}
        }

        dispatcher.registerHandler(PacketType.DISCONNECT.value) { conn, _ ->
            conn.close()
        }
    }
}
`
  },
  {
    name: "TransferManager.kt",
    description: "Slices large files into sequential binary payloads asynchronously and guides file reconstruction securely.",
    code: `package com.bouazza.swift.protocol.transfer

import com.bouazza.swift.protocol.callbacks.ProtocolListener
import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.constants.ProtocolConstants
import com.bouazza.swift.protocol.fields.FieldWriter
import com.bouazza.swift.protocol.packet.Packet
import com.bouazza.swift.protocol.packet.PacketType
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.random.Random

class TransferTask(
    val transferId: Int,
    val file: File,
    val totalBytes: Long,
    val chunkSize: Int,
    val isOutgoing: Boolean,
    val startTimeMs: Long = System.currentTimeMillis()
) {
    var bytesTransferred: Long = 0
    var lastUpdatedTimeMs: Long = startTimeMs
    val isCanceled = AtomicBoolean(false)
    var fileOutputStream: FileOutputStream? = null
}

class TransferManager(
    private val listener: ProtocolListener,
    private val defaultStorageDir: File = File("received_files")
) {
    private val activeTransfers = ConcurrentHashMap<Int, TransferTask>()

    init {
        if (!defaultStorageDir.exists()) defaultStorageDir.mkdirs()
    }

    fun startOutgoingTransfer(connection: Connection, file: File, chunkSize: Int = 4096) {
        if (!file.exists() || !file.isFile) {
            listener.onError(IOException("File not found: \${file.absolutePath}"))
            return
        }

        val transferId = Random.nextInt(10000, 99999)
        val task = TransferTask(transferId, file, file.length(), chunkSize, isOutgoing = true)
        activeTransfers[transferId] = task

        Thread({
            try {
                val startPayload = FieldWriter()
                    .writeInt(ProtocolConstants.KEY_TRANSFER_ID, transferId)
                    .writeString(ProtocolConstants.KEY_FILE_NAME, file.name)
                    .writeLong(ProtocolConstants.KEY_FILE_SIZE, task.totalBytes)
                    .writeInt(ProtocolConstants.KEY_CHUNK_SIZE, chunkSize)
                    .getBytes()

                connection.sendPacket(Packet(PacketType.FILE_START, startPayload))
                listener.onFileStarted(transferId, file.name, task.totalBytes, chunkSize)

                FileInputStream(file).use { fis ->
                    val buffer = ByteArray(chunkSize)
                    var chunkNumber = 0
                    
                    while (!task.isCanceled.get()) {
                        val bytesRead = fis.read(buffer)
                        if (bytesRead == -1) break

                        chunkNumber++
                        val chunkData = if (bytesRead == chunkSize) buffer else buffer.copyOf(bytesRead)

                        val chunkPayload = FieldWriter()
                            .writeInt(ProtocolConstants.KEY_TRANSFER_ID, transferId)
                            .writeInt(ProtocolConstants.KEY_CHUNK_NUMBER, chunkNumber)
                            .writeBytes(ProtocolConstants.KEY_BINARY_DATA, chunkData)
                            .getBytes()

                        connection.sendPacket(Packet(PacketType.FILE_CHUNK, chunkPayload))
                        task.bytesTransferred += bytesRead
                        notifyProgress(task)

                        Thread.sleep(1)
                    }
                }

                if (task.isCanceled.get()) {
                    listener.onFileCancelled(transferId)
                    return@Thread
                }

                val endPayload = FieldWriter()
                    .writeInt(ProtocolConstants.KEY_TRANSFER_ID, transferId)
                    .getBytes()

                connection.sendPacket(Packet(PacketType.FILE_END, endPayload))
                listener.onFileCompleted(transferId, file.name, task.totalBytes, file.absolutePath)

            } catch (e: Exception) {
                listener.onError(IOException("Error in outgoing transfer \$transferId: \${e.message}", e))
            } finally {
                activeTransfers.remove(transferId)
            }
        }).start()
    }

    fun handleIncomingStart(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {
        val destinationFile = File(defaultStorageDir, "received_\${System.currentTimeMillis()}_\$fileName")
        val task = TransferTask(transferId, destinationFile, fileSize, chunkSize, isOutgoing = false)
        try {
            task.fileOutputStream = FileOutputStream(destinationFile)
            activeTransfers[transferId] = task
            listener.onFileStarted(transferId, fileName, fileSize, chunkSize)
        } catch (e: Exception) {
            listener.onError(e)
        }
    }

    fun handleIncomingChunk(transferId: Int, chunkNumber: Int, data: ByteArray) {
        val task = activeTransfers[transferId] ?: return
        if (task.isCanceled.get()) return
        try {
            task.fileOutputStream?.write(data)
            task.bytesTransferred += data.size
            notifyProgress(task)
        } catch (e: Exception) {
            listener.onError(e)
            cancelTransfer(transferId)
        }
    }

    fun handleIncomingEnd(transferId: Int) {
        val task = activeTransfers[transferId] ?: return
        try {
            task.fileOutputStream?.flush()
            task.fileOutputStream?.close()
            task.fileOutputStream = null
            listener.onFileCompleted(transferId, task.file.name, task.bytesTransferred, task.file.absolutePath)
        } catch (e: Exception) {
            listener.onError(e)
        } finally {
            activeTransfers.remove(transferId)
        }
    }

    fun cancelTransfer(transferId: Int) {
        val task = activeTransfers.remove(transferId) ?: return
        task.isCanceled.set(true)
        if (!task.isOutgoing) {
            try {
                task.fileOutputStream?.close()
                if (task.file.exists()) task.file.delete()
            } catch (ignored: Exception) {}
            listener.onFileCancelled(transferId)
        }
    }

    private fun notifyProgress(task: TransferTask) {
        val now = System.currentTimeMillis()
        val elapsedTimeSec = (now - task.startTimeMs) / 1000.0
        val speedBytesPerSec = if (elapsedTimeSec > 0) (task.bytesTransferred / elapsedTimeSec).toLong() else 0L
        val remainingBytes = task.totalBytes - task.bytesTransferred
        val estimatedRemainingSeconds = if (speedBytesPerSec > 0) remainingBytes / speedBytesPerSec else -1L
        val percentage = if (task.totalBytes > 0) (task.bytesTransferred.toDouble() / task.totalBytes) * 100.0 else 100.0

        if (now - task.lastUpdatedTimeMs >= 150 || task.bytesTransferred == task.totalBytes) {
            task.lastUpdatedTimeMs = now
            listener.onFileProgress(task.transferId, task.bytesTransferred, task.totalBytes, percentage, speedBytesPerSec, estimatedRemainingSeconds)
        }
    }
}
`
  },
  {
    name: "ProtocolListener.kt",
    description: "Adapter-style callback interface allowing Android applications to listen to state modifications, incoming packets, and live ETA file progression.",
    code: `package com.bouazza.swift.protocol.callbacks

interface ProtocolListener {
    fun onConnected(host: String, port: Int) {}
    fun onDisconnected() {}
    fun onHandshake(deviceName: String, appName: String, appVersion: String, platform: String, protocolVersion: Short, capabilities: String) {}
    fun onTextReceived(sender: String, text: String) {}
    fun onFileStarted(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {}
    fun onFileProgress(transferId: Int, bytesTransferred: Long, totalBytes: Long, percentage: Double, speedBytesPerSec: Long, estimatedRemainingSeconds: Long) {}
    fun onFileCompleted(transferId: Int, fileName: String, totalBytesReceived: Long, savePath: String) {}
    fun onFileCancelled(transferId: Int) {}
    fun onError(exception: Exception) {}
}
`
  }
];
