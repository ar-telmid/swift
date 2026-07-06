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
    description: "An event-driven packet router containing virtual handler methods for server and client implementations.",
    code: `from packet import Packet
from packet_types import PacketType

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
    
    Spawns a background thread that continuously blocks on the socket,
    reads packets, and dispatches them to a designated Dispatcher.
    """

    def __init__(self, sock: socket.socket, dispatcher: Dispatcher):
        """
        Initialize a connection with a socket and a packet dispatcher.
        
        :param sock: The active connected TCP socket
        :param dispatcher: The Dispatcher instance to handle incoming packets
        """
        self.sock: socket.socket = sock
        self.dispatcher: Dispatcher = dispatcher
        self._is_running: bool = False
        self._read_thread: Optional[threading.Thread] = None
        self._send_lock = threading.Lock()  # Prevent simultaneous writes from multiple threads

    def start(self) -> None:
        """Start the background packet receiver thread."""
        if self._is_running:
            return
            
        self._is_running = True
        self._read_thread = threading.Thread(target=self._receive_loop, name="Connection-Receiver", daemon=True)
        self._read_thread.start()

    def send_packet(self, packet: Packet) -> None:
        """
        Send a Packet over the TCP socket in a thread-safe manner.
        
        :param packet: The Packet instance to send
        :raises ConnectionError: If the socket is closed or fails to send
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

    def close(self) -> None:
        """Close the socket and stop the background receiver thread."""
        if not self._is_running:
            return

        self._is_running = False
        try:
            # Shutdown socket to immediately wake up recv() blocks
            self.sock.shutdown(socket.SHUT_RDWR)
        except socket.error:
            pass

        try:
            self.sock.close()
        except socket.error:
            pass

        # Since daemon=True is set, we don't necessarily have to block joining,
        # but joining briefly is good practice.
        if self._read_thread and threading.current_thread() != self._read_thread:
            self._read_thread.join(timeout=1.0)

    def _receive_loop(self) -> None:
        """Continuous reading loop executed inside the daemon background thread."""
        try:
            while self._is_running:
                # Blocks until a complete packet is received
                packet = Packet.receive_from_socket(self.sock)
                # Dispatch the packet to our handler
                self.dispatcher.dispatch(self, packet)
        except ConnectionError:
            # Expected when socket is closed or disconnected
            pass
        except Exception as e:
            print(f"[Connection] Error in receiver loop: {e}")
        finally:
            self.close()
            # Inform dispatcher of disconnect
            # We construct a mock DISCONNECT packet to represent the socket closure
            from packet_types import PacketType
            disconnect_packet = Packet(PacketType.DISCONNECT)
            self.dispatcher.dispatch(self, disconnect_packet)

    @property
    def is_active(self) -> bool:
        """Check if the connection is currently running and active."""
        return self._is_running
`
  },
  {
    name: "server.py",
    description: "The TCP Multi-Threaded Server. Listens for client connections, spawns dispatchers, and manages incoming high-speed file reassembly.",
    code: `import os
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

            print(f"\\n[Server] Handshake received from client!")
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
            print(f"\\n[Client Message] {sender}: {message}")
        except Exception as e:
            print(f"[Server] Error reading text packet: {e}")

    def on_file_start(self, connection: Connection, packet: Packet) -> None:
        try:
            reader = FieldReader(packet.payload)
            transfer_id = reader.get_int(KEY_TRANSFER_ID)
            file_name = reader.get_string(KEY_FILE_NAME)
            file_size = reader.get_long(KEY_FILE_SIZE)
            chunk_size = reader.get_int(KEY_CHUNK_SIZE)

            print(f"\\n[File Transfer] Initializing download:")
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
                print(f"  Chunk #{chunk_num} received: {len(binary_data)} bytes ({pct:.1f}% downloaded)", end="\\r")
        except Exception as e:
            print(f"\\n[Server] Error parsing file chunk: {e}")

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

            print(f"\\n[File Transfer Complete] Saved '{transfer.file_name}' to 'received_files/' folder.")
            print(f"  Total size: {transfer.bytes_received} bytes across {transfer.chunks_received} chunks.")
            del self.active_transfers[transfer_id]
        except Exception as e:
            print(f"\\n[Server] Error completing file transfer: {e}")

    def on_ping(self, connection: Connection, packet: Packet) -> None:
        print("[Server] Ping received. Replying with Pong.")
        pong_packet = Packet(PacketType.PONG)
        connection.send_packet(pong_packet)

    def on_disconnect(self, connection: Connection, packet: Packet) -> None:
        print("\\n[Server] Client disconnected.")
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
                print(f"\\n[Server] Direct socket connection accepted from {addr[0]}:{addr[1]}")
                
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
`
  },
  {
    name: "client.py",
    description: "The TCP Client. Integrates connection handshake, structured payload writing, and segmented binary file uploading.",
    code: `import os
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
            print(f"\\n[Client] Handshake ACK received! Status: {'Approved' if success else 'Rejected'} - Message: {message}")
        except Exception as e:
            print(f"[Client] Error reading handshake ack: {e}")

    def on_pong(self, connection: Connection, packet: Packet) -> None:
        print("\\n[Client] Pong reply received from server.")

    def on_disconnect(self, connection: Connection, packet: Packet) -> None:
        print("\\n[Client] Disconnected from server.")

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

        print(f"\\n[Client] Initiating high-speed file transfer for '{file_name}':")
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
                print(f"  Streamed chunk #{chunk_number}: {len(data)} bytes ({pct:.1f}% sent)", end="\\r")
                
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
`
  }
];
