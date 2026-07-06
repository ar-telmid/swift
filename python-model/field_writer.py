import struct
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
