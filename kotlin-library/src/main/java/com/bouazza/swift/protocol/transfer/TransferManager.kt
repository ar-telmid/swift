package com.bouazza.swift.protocol.transfer

import com.bouazza.swift.protocol.callbacks.ProtocolListener
import com.bouazza.swift.protocol.connection.Connection
import com.bouazza.swift.protocol.constants.ProtocolConstants
import com.bouazza.swift.protocol.fields.FieldWriter
import com.bouazza.swift.protocol.packet.Packet
import com.bouazza.swift.protocol.packet.PacketType
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.random.Random

/**
 * Represents a tracked state of an active file transfer.
 */
class TransferTask(
    val transferId: Int,
    val file: File,
    val totalBytes: Long,
    val chunkSize: Int,
    val isOutgoing: Boolean,
    val startTimeMs: Long = System.currentTimeMillis()
) {
    var bytesTransferred: Long = 0
    var lastUpdatedTimeMs: Long = startTimeMs
    val isCanceled = AtomicBoolean(false)
    var fileOutputStream: FileOutputStream? = null
}

/**
 * Core component responsible for executing, slicing, assembly, and monitoring of binary file transfers.
 * Fully supports chunk-based transmissions, live ETA tracking, and dynamic cancellations.
 */
class TransferManager(
    private val listener: ProtocolListener,
    private val defaultStorageDir: File = File("received_files")
) {
    private val activeTransfers = ConcurrentHashMap<Int, TransferTask>()

    init {
        if (!defaultStorageDir.exists()) {
            defaultStorageDir.mkdirs()
        }
    }

    /**
     * Symmetrically begins streaming an outgoing file to the remote peer in chunks.
     * Runs asynchronously on a background thread so it doesn't block the caller.
     *
     * @param connection The active connection.
     * @param file The local file to transmit.
     * @param chunkSize Size of each chunk in bytes (default 4096).
     */
    fun startOutgoingTransfer(connection: Connection, file: File, chunkSize: Int = 4096) {
        if (!file.exists() || !file.isFile) {
            listener.onError(IOException("File not found or is invalid: ${file.absolutePath}"))
            return
        }

        val transferId = Random.nextInt(10000, 99999)
        val task = TransferTask(transferId, file, file.length(), chunkSize, isOutgoing = true)
        activeTransfers[transferId] = task

        Thread({
            try {
                // 1. Send FILE_START
                val startPayload = FieldWriter()
                    .writeInt(ProtocolConstants.KEY_TRANSFER_ID, transferId)
                    .writeString(ProtocolConstants.KEY_FILE_NAME, file.name)
                    .writeLong(ProtocolConstants.KEY_FILE_SIZE, task.totalBytes)
                    .writeInt(ProtocolConstants.KEY_CHUNK_SIZE, chunkSize)
                    .getBytes()

                connection.sendPacket(Packet(PacketType.FILE_START, startPayload))
                listener.onFileStarted(transferId, file.name, task.totalBytes, chunkSize)

                // 2. Stream chunks
                FileInputStream(file).use { fis ->
                    val buffer = ByteArray(chunkSize)
                    var chunkNumber = 0
                    
                    while (!task.isCanceled.get()) {
                        val bytesRead = fis.read(buffer)
                        if (bytesRead == -1) break

                        chunkNumber++
                        val chunkData = if (bytesRead == chunkSize) buffer else buffer.copyOf(bytesRead)

                        val chunkPayload = FieldWriter()
                            .writeInt(ProtocolConstants.KEY_TRANSFER_ID, transferId)
                            .writeInt(ProtocolConstants.KEY_CHUNK_NUMBER, chunkNumber)
                            .writeBytes(ProtocolConstants.KEY_BINARY_DATA, chunkData)
                            .getBytes()

                        connection.sendPacket(Packet(PacketType.FILE_CHUNK, chunkPayload))
                        
                        task.bytesTransferred += bytesRead
                        notifyProgress(task)

                        // Tiny throttle to yield to CPU
                        Thread.sleep(1)
                    }
                }

                if (task.isCanceled.get()) {
                    listener.onFileCancelled(transferId)
                    activeTransfers.remove(transferId)
                    return@Thread
                }

                // 3. Send FILE_END
                val endPayload = FieldWriter()
                    .writeInt(ProtocolConstants.KEY_TRANSFER_ID, transferId)
                    .getBytes()

                connection.sendPacket(Packet(PacketType.FILE_END, endPayload))
                listener.onFileCompleted(transferId, file.name, task.totalBytes, file.absolutePath)

            } catch (e: Exception) {
                listener.onError(IOException("Error in outgoing file transfer $transferId: ${e.message}", e))
            } finally {
                activeTransfers.remove(transferId)
            }
        }, "SwiftTransfer-Sender-$transferId").start()
    }

    /**
     * Handles the start of an incoming file transfer from the remote peer.
     */
    fun handleIncomingStart(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {
        val destinationFile = File(defaultStorageDir, "received_${System.currentTimeMillis()}_$fileName")
        val task = TransferTask(transferId, destinationFile, fileSize, chunkSize, isOutgoing = false)
        
        try {
            task.fileOutputStream = FileOutputStream(destinationFile)
            activeTransfers[transferId] = task
            listener.onFileStarted(transferId, fileName, fileSize, chunkSize)
        } catch (e: Exception) {
            listener.onError(IOException("Failed to create file for incoming transfer: ${e.message}", e))
        }
    }

    /**
     * Appends an incoming chunk to the appropriate file.
     */
    fun handleIncomingChunk(transferId: Int, chunkNumber: Int, data: ByteArray) {
        val task = activeTransfers[transferId] ?: return
        if (task.isCanceled.get()) return

        try {
            task.fileOutputStream?.write(data)
            task.bytesTransferred += data.size
            notifyProgress(task)
        } catch (e: Exception) {
            listener.onError(IOException("Failed writing chunk #$chunkNumber for transfer $transferId: ${e.message}", e))
            cancelTransfer(transferId)
        }
    }

    /**
     * Finalizes and completes an incoming file transfer.
     */
    fun handleIncomingEnd(transferId: Int) {
        val task = activeTransfers[transferId] ?: return
        try {
            task.fileOutputStream?.flush()
            task.fileOutputStream?.close()
            task.fileOutputStream = null

            listener.onFileCompleted(
                transferId,
                task.file.name,
                task.bytesTransferred,
                task.file.absolutePath
            )
        } catch (e: Exception) {
            listener.onError(IOException("Failed finalizing transfer $transferId: ${e.message}", e))
        } finally {
            activeTransfers.remove(transferId)
        }
    }

    /**
     * Cancels an active file transfer in either direction.
     * Closes underlying stream handles and deletes partial incoming files cleanly.
     *
     * @param transferId ID of the transfer task.
     */
    fun cancelTransfer(transferId: Int) {
        val task = activeTransfers.remove(transferId) ?: return
        task.isCanceled.set(true)

        if (!task.isOutgoing) {
            try {
                task.fileOutputStream?.close()
                task.fileOutputStream = null
                if (task.file.exists()) {
                    task.file.delete()
                }
            } catch (ignored: Exception) {}
            listener.onFileCancelled(transferId)
        }
    }

    /**
     * Calculates transfer speed, estimates ETA, and fires the progress event callback.
     */
    private fun notifyProgress(task: TransferTask) {
        val now = System.currentTimeMillis()
        val elapsedTimeSec = (now - task.startTimeMs) / 1000.0
        
        val speedBytesPerSec = if (elapsedTimeSec > 0) {
            (task.bytesTransferred / elapsedTimeSec).toLong()
        } else {
            0L
        }

        val remainingBytes = task.totalBytes - task.bytesTransferred
        val estimatedRemainingSeconds = if (speedBytesPerSec > 0) {
            remainingBytes / speedBytesPerSec
        } else {
            -1L
        }

        val percentage = if (task.totalBytes > 0) {
            (task.bytesTransferred.toDouble() / task.totalBytes) * 100.0
        } else {
            100.0
        }

        // Avoid overwhelming the UI by only updating frequently, but not on every single loop
        if (now - task.lastUpdatedTimeMs >= 150 || task.bytesTransferred == task.totalBytes) {
            task.lastUpdatedTimeMs = now
            listener.onFileProgress(
                task.transferId,
                task.bytesTransferred,
                task.totalBytes,
                percentage,
                speedBytesPerSec,
                estimatedRemainingSeconds
            )
        }
    }
}
