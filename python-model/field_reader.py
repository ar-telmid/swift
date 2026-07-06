import struct
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
