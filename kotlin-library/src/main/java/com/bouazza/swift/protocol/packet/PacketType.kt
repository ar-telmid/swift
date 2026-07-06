package com.bouazza.swift.protocol.packet

/**
 * Standard enum representing supported packet types in the Swift protocol.
 * Each packet type maps to a unique 1-byte identifier.
 */
enum class PacketType(val value: Byte) {
    HANDSHAKE(0x01),
    HANDSHAKE_ACK(0x02),
    TEXT(0x03),
    FILE_START(0x04),
    FILE_CHUNK(0x05),
    FILE_END(0x06),
    PING(0x07),
    PONG(0x08),
    DISCONNECT(0x09);

    companion object {
        /**
         * Resolves a raw byte value to its corresponding [PacketType].
         *
         * @param value Raw 1-byte identifier.
         * @return Decoded PacketType or null if unsupported.
         */
        fun fromByte(value: Byte): PacketType? {
            return values().find { it.value == value }
        }
    }
}
