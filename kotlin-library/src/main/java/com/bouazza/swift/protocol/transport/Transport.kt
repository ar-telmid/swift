package com.bouazza.swift.protocol.transport

import java.io.IOException

/**
 * Interface abstracting raw bidirectional network stream transmissions.
 * Decouples the upper protocol parser from the low-level socket APIs.
 */
interface Transport {
    /**
     * Checks if the transport channel is open and active.
     */
    val isActive: Boolean

    /**
     * Transmits raw binary data fully over the transport channel.
     *
     * @param data Byte array to send.
     * @throws IOException If transmission fails or the transport is closed.
     */
    @throws(IOException::class)
    fun write(data: ByteArray)

    /**
     * Blocks and reads up to [length] bytes of data from the channel into the [buffer].
     *
     * @param buffer Pre-allocated buffer to store read bytes.
     * @param offset Starting offset inside the buffer.
     * @param length Exact number of bytes to read.
     * @return Number of bytes actually read, or -1 if the end of stream has been reached.
     * @throws IOException If a read error occurs.
     */
    @throws(IOException::class)
    fun read(buffer: ByteArray, offset: Int, length: Int): Int

    /**
     * Flushes any buffered outbound bytes.
     *
     * @throws IOException if a flush error occurs.
     */
    @throws(IOException::class)
    fun flush()

    /**
     * Shuts down and releases all socket resources.
     */
    fun close()
}
