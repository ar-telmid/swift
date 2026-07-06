package com.bouazza.swift.protocol.fields

import java.io.ByteArrayOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

/**
 * High-level binary payload builder implementing custom Type-Length-Value formatting.
 */
class FieldWriter {
    private val outputStream = ByteArrayOutputStream()

    /**
     * Serializes a field key and its raw byte value, writing them to the payload.
     */
    fun writeBytes(key: Byte, value: ByteArray): FieldWriter {
        val field = Field(key, value)
        try {
            outputStream.write(field.serialize())
        } catch (ignored: IOException) {}
        return this
    }

    /**
     * Serializes a string field in UTF-8.
     */
    fun writeString(key: Byte, value: String): FieldWriter {
        val bytes = value.toByteArray(StandardCharsets.UTF_8)
        return writeBytes(key, bytes)
    }

    /**
     * Serializes a 16-bit signed integer (Short) in Big-Endian.
     */
    fun writeShort(key: Byte, value: Short): FieldWriter {
        val buffer = ByteBuffer.allocate(2).putShort(value)
        return writeBytes(key, buffer.array())
    }

    /**
     * Serializes a 32-bit signed integer (Int) in Big-Endian.
     */
    fun writeInt(key: Byte, value: Int): FieldWriter {
        val buffer = ByteBuffer.allocate(4).putInt(value)
        return writeBytes(key, buffer.array())
    }

    /**
     * Serializes a 64-bit signed integer (Long) in Big-Endian.
     */
    fun writeLong(key: Byte, value: Long): FieldWriter {
        val buffer = ByteBuffer.allocate(8).putLong(value)
        return writeBytes(key, buffer.array())
    }

    /**
     * Serializes a boolean (Boolean) as a 1-byte integer (1 = true, 0 = false).
     */
    fun writeBoolean(key: Byte, value: Boolean): FieldWriter {
        val byteVal = if (value) 1.toByte() else 0.toByte()
        return writeBytes(key, byteArrayOf(byteVal))
    }

    /**
     * Compiles and retrieves the accumulated serialized binary payload bytes.
     */
    fun getBytes(): ByteArray {
        return outputStream.toByteArray()
    }

    /**
     * Clears all written fields to allow buffer reuse.
     */
    fun clear() {
        outputStream.reset()
    }
}
