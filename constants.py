"""
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
