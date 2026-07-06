package com.bouazza.swift.protocol.constants

/**
 * Global Constants for the Swift binary peer-to-peer TCP protocol.
 * Includes boundaries, standard field keys, default ports, and buffer configs.
 */
object ProtocolConstants {
    /**
     * Single-byte field boundary validation marker (0x00).
     */
    const val FIELD_MARKER: Byte = 0x00

    // --- Handshake Metadata Keys ---
    const val KEY_DEVICE_NAME: Byte = 0x01
    const val KEY_APP_NAME: Byte = 0x02
    const val KEY_APP_VERSION: Byte = 0x03
    const val KEY_PLATFORM: Byte = 0x04
    const val KEY_PROTOCOL_VERSION: Byte = 0x05
    const val KEY_CAPABILITIES: Byte = 0x06

    // --- Handshake Ack Keys ---
    const val KEY_HANDSHAKE_SUCCESS: Byte = 0x01
    const val KEY_HANDSHAKE_MESSAGE: Byte = 0x02

    // --- File Stream Keys ---
    const val KEY_TRANSFER_ID: Byte = 0x0A
    const val KEY_FILE_NAME: Byte = 0x0B
    const val KEY_FILE_SIZE: Byte = 0x0C
    const val KEY_CHUNK_SIZE: Byte = 0x0D
    const val KEY_CHUNK_NUMBER: Byte = 0x0E
    const val KEY_BINARY_DATA: Byte = 0x0F

    // --- Chat / Message Keys ---
    const val KEY_TEXT_MESSAGE: Byte = 0x14
    const val KEY_SENDER_NAME: Byte = 0x15

    // --- Network Defaults ---
    const val DEFAULT_PORT: Int = 9999
    const val DEFAULT_BUFFER_SIZE: Int = 4096
}
