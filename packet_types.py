from enum import IntEnum

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
