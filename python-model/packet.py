import struct
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
