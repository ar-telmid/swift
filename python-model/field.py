from typing import Any
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
