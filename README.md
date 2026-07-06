# SwiftP2PEngine

[![](https://jitpack.io/v/ar-telmid/swift.svg)](https://jitpack.io/#ar-telmid/swift)

A high-performance, lightweight, and symmetric binary TCP peer-to-peer communication and file-sharing library designed for Android and JVM platforms. 

SwiftP2PEngine abstracts the complexity of low-level sockets, multi-threading, custom binary serialization, and raw byte-streaming into a clean, event-driven Kotlin API. Optimized for local area networks (LAN), it provides ultra-fast file transfer velocities, real-time message exchange, and live progress/ETA monitoring.

---

## Main Features

*   **True Peer-to-Peer (Symmetric Architecture):** No permanent client/server roles. Once connected, both peers become completely identical, operating full-duplex capabilities over a single persistent TCP connection.
*   **Custom Binary Protocol:** Bypasses heavy serializations like JSON, XML, or Protobuf. Implements a highly efficient binary packet structure and custom Type-Length-Value (TLV) field systems with a negligible overhead.
*   **Chunk-Based File Streaming:** Intelligently slices large binary files into configurable chunk sizes, avoiding memory allocation overheads and preventing socket choke.
*   **Simultaneous Bi-Directional Transfers:** Fully supports sending and receiving files/messages at the exact same time without thread blocking or data interleaving.
*   **Live Metrics Tracking:** Real-time speed calculations (bytes/sec), completion percentages, and live remaining time estimates (ETA) for active transfers.
*   **Android-Safe Threading Model:** Automatic redirection of library background-thread network events to Android's Main Thread (UI Thread) via Looper Handlers to eliminate `NetworkOnMainThreadException` or UI update failures.
*   **Graceful Reconnection & Lifecycle Management:** Built-in handshake sequence validation, heartbeat PING/PONG keep-alives, and clean mid-stream cancellation cleanups.

---

## Installation

SwiftP2PEngine is distributed via **JitPack**. To integrate the library into your Android or JVM project, follow the configuration steps below.

### 1. Add the JitPack Repository

Add the JitPack repository to your root `build.gradle` or `settings.gradle` file:

#### Modern Android Setup (`settings.gradle`)
```groovy
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url 'https://jitpack.io' }
    }
}
```

#### Legacy Android Setup (`build.gradle` root)
```groovy
allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url 'https://jitpack.io' }
    }
}
```

### 2. Add the Gradle Dependency

Add the following dependency to your application or module-level `build.gradle` file:

```groovy
dependencies {
    implementation 'com.github.ar-telmid:swift:e84652e501'
}
```

---

## Quick Start

The public API for SwiftP2PEngine is fully accessible through the `com.bouazza.swift.protocol.Protocol` singleton object. To establish a connection, one peer starts listening, and the other connects directly to it.

### Step 1: Implement the Listener Callback

Both peers must implement the `ProtocolListener` interface to respond to connection, chat, and file stream events.

```kotlin
import com.bouazza.swift.protocol.callbacks.ProtocolListener
import java.io.File

val myProtocolListener = object : ProtocolListener {
    override fun onConnected(host: String, port: Int) {
        println("Connected to peer at $host:$port")
    }

    override fun onDisconnected() {
        println("Connection lost or closed.")
    }

    override fun onHandshake(
        deviceName: String,
        appName: String,
        appVersion: String,
        platform: String,
        protocolVersion: Short,
        capabilities: String
    ) {
        println("Handshake complete! Connected to peer: $deviceName running $appName ($platform)")
    }

    override fun onTextReceived(sender: String, text: String) {
        println("[$sender]: $text")
    }

    override fun onFileStarted(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {
        println("File download started: $fileName ($fileSize bytes)")
    }

    override fun onFileProgress(
        transferId: Int,
        bytesTransferred: Long,
        totalBytes: Long,
        percentage: Double,
        speedBytesPerSec: Long,
        estimatedRemainingSeconds: Long
    ) {
        val speedMbStr = String.format("%.2f", speedBytesPerSec / (1024.0 * 1024.0))
        println("Transfer #$transferId: ${percentage.toInt()}% Completed | Speed: ${speedMbStr} MB/s | ETA: $estimatedRemainingSecondss")
    }

    override fun onFileCompleted(transferId: Int, fileName: String, totalBytesReceived: Long, savePath: String) {
        println("File download finished successfully! Saved to: $savePath")
    }

    override fun onFileCancelled(transferId: Int) {
        println("File transfer #$transferId has been cancelled.")
    }

    override fun onError(exception: Exception) {
        System.err.println("Protocol Error occurred: ${exception.message}")
    }
}
```

### Step 2: Establish the Connection

#### Peer A: Start Listening (Symmetric Server Role)
Peer A opens a local port and blocks inside a background thread until exactly one remote peer connects.

```kotlin
import com.bouazza.swift.protocol.Protocol

val localPort = 9999
val nodeName = "Pixel_8_Pro"

// Starts the server socket and prepares to handle handshake automatically on connection
Protocol.startListening(localPort, myProtocolListener, nodeName)
```

#### Peer B: Connect to Peer A (Symmetric Client Role)
Peer B connects to Peer A's active IP address and port.

```kotlin
import com.bouazza.swift.protocol.Protocol

val remoteIp = "192.168.1.15"
val remotePort = 9999
val nodeName = "Galaxy_S24_Ultra"

// Connects in the background, wrapping socket into the full-duplex protocol engine
Protocol.connect(remoteIp, remotePort, myProtocolListener, nodeName)
```

---

## Peer-to-Peer Architecture

Most traditional network architectures enforce strict, asymmetric server/client constraints. SwiftP2PEngine, however, uses standard socket connection establishment solely to bind the underlying socket descriptor. Immediately after connection, **the client/server distinction is completely eliminated**.

```
+-----------------------------------+             +-----------------------------------+
|              PEER A               |             |              PEER B               |
|  [Port: 9999 / Listening]         |             |  [Connecting to Peer A]           |
+-----------------+-----------------+             +-----------------+-----------------+
                  |                                                 |
                  |                TCP Handshake                    |
                  +-------------------------------------------------+
                  
                      ===========================================
                      CONNECTED STATE (Roles dissolve into Peer)
                      ===========================================
                      
+-----------------------------------+             +-----------------------------------+
|              PEER A               |             |              PEER B               |
|                                   |             |                                   |
|   +---------------------------+   |             |   +---------------------------+   |
|   |    Receiver Loop Thread   |   |             |   |    Receiver Loop Thread   |   |
|   +-------------^-------------+   |             |   +-------------^-------------+   |
|                 |                 |             |                 |                 |
|   +-------------+-------------+   |             |   +-------------+-------------+   |
|   |    Thread-Safe Sender     |   |             |   |    Thread-Safe Sender     |   |
|   +-------------+-------------+   |             |   +-------------+-------------+   |
|                 |                 |             |                 |                 |
+-----------------|-----------------+             +-----------------|-----------------+
                  |                                                 |
                  | <========== Full Duplex Byte Stream ===========>|
```

### Full-Duplex Model
*   **Dual-Active Pipelines:** Every peer maintains an autonomous background reading loop that continually blocks reading from the incoming socket stream. Concurrently, outbound writing operations are isolated by a thread-safe synchronized lock.
*   **Bidirectional Simultaneous Transfer:** Peer A can transmit a 2 GB file to Peer B while Peer B is sending a 500 MB video to Peer A and both are exchanging real-time chat messages. Packets are interleaved gracefully across the stream without blocking.

---

## Handshake

Upon connection establishment, both peers automatically initiate a symmetric **Handshake exchange** before permitting general data flow. This sequence verifies protocol compatibility and exposes device metadata.

### The Handshake Flow
1.  Immediately after connection, each peer constructs and pushes a `HANDSHAKE` packet containing their identity (device name, app metadata, platform SDK, protocol version, and capability flags).
2.  Upon receipt of the remote `HANDSHAKE` packet, the library validates the protocol version and returns a `HANDSHAKE_ACK` packet.
3.  If the handshake is validated on both sides, the `onHandshake` callback is triggered, enabling file and chat functionalities. If a handshake is invalid or rejected, the connection is instantly torn down.

### Exchanged Fields

#### HANDSHAKE Packet (`0x01`)
| Field Key | Key Constant | Byte Type | Data Type | Description |
|---|---|---|---|---|
| `0x01` | `KEY_DEVICE_NAME` | `Byte` | `String` | Self-identification handle for peer (e.g., Device Name) |
| `0x02` | `KEY_APP_NAME` | `Byte` | `String` | Executing application title |
| `0x03` | `KEY_APP_VERSION` | `Byte` | `String` | Version name of the application |
| `0x04` | `KEY_PLATFORM` | `Byte` | `String` | OS identification (e.g., "Android API 34") |
| `0x05` | `KEY_PROTOCOL_VERSION`| `Byte` | `Short` | Swift Protocol specification version (currently `1`) |
| `0x06` | `KEY_CAPABILITIES` | `Byte` | `String` | Delimited custom capability strings (e.g., "TEXT,FILE_CHUNK_V1") |

#### HANDSHAKE_ACK Packet (`0x02`)
| Field Key | Key Constant | Byte Type | Data Type | Description |
|---|---|---|---|---|
| `0x01` | `KEY_HANDSHAKE_SUCCESS`| `Byte` | `Boolean` | `true` if handshake is accepted; `false` to reject connection |
| `0x02` | `KEY_HANDSHAKE_MESSAGE`| `Byte` | `String` | Informative accept/reject reason message |

---

## Sending Text Messages

Real-time message transmission is completely non-blocking and executes on an background executor pool to safeguard calling threads.

```kotlin
import com.bouazza.swift.protocol.Protocol

try {
    val senderHandle = "Jane Doe"
    val chatMessage = "Hello from Android! The binary protocol is incredibly fast."
    
    // Transmits text over active full-duplex session
    Protocol.sendText(senderHandle, chatMessage)
} catch (e: IllegalStateException) {
    println("Failed to send message: No active peer session.")
}
```

---

## Sending Files

File transfers are executed via chunked streaming. Large files are segmented, packetized into logical fields, and written sequentially to prevent heavy heap utilization.

```kotlin
import com.bouazza.swift.protocol.Protocol
import java.io.File

val targetFile = File("/storage/emulated/0/Download/presentation.mp4")
val dynamicChunkSize = 8192 // 8 KB chunks for balanced LAN throughput

try {
    // Slices and streams file asynchronously
    Protocol.sendFile(targetFile, dynamicChunkSize)
    println("Outgoing stream initiated...")
} catch (e: Exception) {
    System.err.println("Failed to start file transfer: ${e.message}")
}
```

### Protocol File Slicing Internals
1.  **File Validation:** The library verifies the local file's accessibility and size.
2.  **Generating Transfer ID:** A random 5-digit integer (`10000` to `99999`) is generated. This **Transfer ID** uniquely indexes this file stream, enabling the multiplexing of multiple files.
3.  **FILE_START Transmission:** A packet with type `FILE_START` (`0x04`) is sent, declaring the file's metadata: `Transfer ID`, `File Name`, `File Size`, and `Chunk Size`.
4.  **Chunk Streaming:** The file is streamed through a `FileInputStream`. A buffer of the requested `chunkSize` is read and written into sequential `FILE_CHUNK` (`0x05`) packets alongside the current `Chunk Number` and the `Binary Data` block. A sleep throttle of `1ms` is added to prevent thread exhaustion on low-end CPUs.
5.  **FILE_END Finalization:** When the end of the file stream is reached, a `FILE_END` (`0x06`) packet containing the `Transfer ID` is pushed, signaling completion to the remote peer.

---

## Receiving Files

Receiving files is handled entirely automatically by the `TransferManager` inside the session coordinator. No manual socket assembly or packet sorting is needed from the developer.

```
Incoming Stream
========================================================================
[FILE_START] ===> Allocates temporary save file with randomized prefix
[FILE_CHUNK] ===> Appends raw binary data slice directly onto disk
[FILE_CHUNK] ===> Appends raw binary data slice directly onto disk
[FILE_END]   ===> Flushes stream, closes file, and fires completion callback
```

*   **Secure Storage Isolation:** By default, received files are isolated within the `received_files/` directory. Path traversal vulnerabilities are eliminated by routing filename strings through `java.io.File(defaultStorageDir, "received_${System.currentTimeMillis()}_$fileName")` ensuring no file escapes the target bounds.
*   **Progress Metrics Delivery:** During reception, the library calculates live metrics and fires the `onFileProgress` callback at capped `150ms` intervals to protect UI elements from high-frequency rendering starvation.
*   **Dynamic Cancellation:** If a peer triggers transfer cancellation (or is disconnected), the library closes file descriptors and deletes the partial temporary file cleanly.

---

## Event Listeners

The `ProtocolListener` interface provides event callbacks. Developers can override only the specific events they care about, as all interface functions provide empty default bodies.

| Callback Method | Invocation Context | Parameter Breakdown |
|---|---|---|
| `onConnected` | Triggered immediately when raw TCP socket binds with remote peer. | `host: String` (remote IP)<br>`port: Int` (remote port) |
| `onDisconnected` | Triggered when peer drops connection, socket closes, or `DISCONNECT` is received. | None |
| `onHandshake` | Triggered when bidirectional handshake validations succeed. | `deviceName: String`, `appName: String`, `appVersion: String`, `platform: String`, `protocolVersion: Short`, `capabilities: String` |
| `onTextReceived` | Called when plain text chat message arrives. | `sender: String` (name of sender)<br>`text: String` (payload text) |
| `onFileStarted` | Triggered when a new file stream begins (incoming or outgoing). | `transferId: Int` (unique tracker ID)<br>`fileName: String` (name)<br>`fileSize: Long` (total bytes)<br>`chunkSize: Int` (size of chunks) |
| `onFileProgress` | Fired periodically to report file transfer metrics. | `transferId: Int` (tracker ID)<br>`bytesTransferred: Long` (bytes)<br>`totalBytes: Long` (total size)<br>`percentage: Double` (0.0 to 100.0)<br>`speedBytesPerSec: Long` (live rate)<br>`estimatedRemainingSeconds: Long` (ETA) |
| `onFileCompleted` | Fired when file finishes, is verified, and is flushed on disk. | `transferId: Int` (tracker ID)<br>`fileName: String` (final name)<br>`totalBytesReceived: Long` (size)<br>`savePath: String` (absolute file path) |
| `onFileCancelled` | Called if transfer is cancelled midway by either sender or receiver. | `transferId: Int` (tracker ID) |
| `onError` | Dispatched when a parsing error, socket exception, or invalid packet is processed. | `exception: Exception` (error stack) |

---

## Packet System

Every communication over the network is encapsulated within a custom **Logical Packet structure**.

```
+-------------------+------------------------------+-------------------------------------+
| Packet Type (1B)  | Payload Length (2B - BigEnd) |       Payload Data (0-65535 Bytes)  |
+-------------------+------------------------------+-------------------------------------+
|       0x05        |          0x10 0x00           |            Variable Fields          |
+-------------------+------------------------------+-------------------------------------+
```

### Header Specifications
A fixed **3-byte header** precedes every transmission:
1.  **Packet Type (1 Byte):** Defines the operational instruction.
2.  **Payload Length (2 Bytes):** A Big-Endian 16-bit unsigned short declaring the size of the following payload (allowing up to 65,535 bytes).

### Packet Types Reference

| Numeric Value | Type Constant | Purpose / Context |
|---|---|---|
| `0x01` | `HANDSHAKE` | Handshake initialization, metadata transmission. |
| `0x02` | `HANDSHAKE_ACK` | Returns handshake status and approval message. |
| `0x03` | `TEXT` | Delivers real-time chat message content. |
| `0x04` | `FILE_START` | Declares file transfer registration info. |
| `0x05` | `FILE_CHUNK` | Carries sliced binary block of file stream. |
| `0x06` | `FILE_END` | Signals file end and stream closure. |
| `0x07` | `PING` | Keep-alive heartbeat request. |
| `0x08` | `PONG` | Heartbeat keep-alive confirmation reply. |
| `0x09` | `DISCONNECT` | Graceful disconnection notice. |

---

## Field System (Type-Length-Value)

Within complex packet payloads (such as `HANDSHAKE`, `FILE_START`, or `FILE_CHUNK`), data is packed using a strict, nested **Type-Length-Value (TLV)** layout called **Fields**.

```
+--------------------+------------------+------------------------------+---------------------------+
| Field Marker (1B)  |  Field Key (1B)  | Value Length (2B - BigEnd)   |       Raw Value Bytes     |
+--------------------+------------------+------------------------------+---------------------------+
|        0x00        |       0x0B       |          0x00 0x0C           |  "document.pdf" (encoded) |
+--------------------+------------------+------------------------------+---------------------------+
```

### Field Layout
*   **Field Marker (1 Byte):** Always set to `0x00`. Used by parsing algorithms as a validation check for payload boundaries.
*   **Field Key (1 Byte):** Unique field identifier specifying how to decode the value.
*   **Value Length (2 Bytes):** A Big-Endian 16-bit unsigned integer declaring the length of the raw value bytes.
*   **Raw Value Bytes (Variable):** The actual data payload.

### Why JSON is Not Used
1.  **No Parser Overhead:** Parsing JSON requires extensive CPU overhead, text scans, boundary searches, and heap allocations. The Swift TLV system parses binary arrays sequentially with simple byte offsets.
2.  **Ultra-Low Network Overhead:** A JSON representation like `{"transferId":12345,"chunkNumber":20,"data":"..."}` incurs massive metadata text overhead. Swift's binary fields require only 4 bytes of overhead per field.
3.  **No Reflection or Runtime Dependencies:** JSON parsing in Kotlin/Android relies on heavy libraries (Gson, Jackson, Kotlinx Serialization) that use reflection or compiler plugins. SwiftP2PEngine runs natively on raw JVM `ByteBuffer` arrays with zero dependencies.

---

## Threading Model

To ensure seamless execution, SwiftP2PEngine leverages a multi-threaded architecture that isolates slow network operations from application logic.

```
       ======================= RUNTIME THREAD POOL =======================

       [Caller Thread (UI / Worker)]
                    |
                    |  (Asynchronous Call)
                    v
         +--------------------+
         |   Executor Pool    | ======> Thread-Safe PacketWriter (Synchronized Lock)
         +--------------------+                     |
                                                    v
                                          [Outbound Socket Stream]
                                                    |
                                                    v
                                          [Inbound Socket Stream]
                                                    |
         +--------------------+                     v
         |  Receiver Thread   | <====== PacketReader Loop (Continuous Block)
         +---------+----------+
                   |
                   |  (Post Callback to Handler)
                   v
         +--------------------+
         |  Android Main Looper| ======> ProtocolListener Callback Execution (UI Thread Safe)
         +--------------------+
```

### 1. Autonomous Receiver Thread
Each active connection spins up a dedicated background thread named `SwiftConnection-Receiver`. This thread runs a continuous loop that blocks on `PacketReader.readPacket()`. When a packet arrives, it is processed, mapped via `Dispatcher`, and handed to callbacks immediately. This ensures the main app thread is never blocked.

### 2. Thread-Safe Writing
All outbound writes are managed through `PacketWriter`. Writing methods are protected by a synchronized mutual exclusion lock (`lock = Any()`). This allows any worker thread or UI component to call `Protocol.sendText` or `Protocol.sendFile` concurrently. The library handles synchronization under the hood, preventing interleaved packet bytes.

### 3. Main-Thread Callback Integration
Android prohibits UI modifications from background worker threads. To solve this, SwiftP2PEngine wraps user-defined listeners inside a `MainThreadListenerProxy`. This proxy captures connection and data callbacks and automatically dispatches them onto the Android Main Thread using a standard `android.os.Handler(Looper.getMainLooper())`. Developers can update TextViews, update ProgressBar UI elements, or show Toast alerts directly inside callbacks without needing manually nested `runOnUiThread` calls.

---

## Connection Lifecycle

SwiftP2PEngine connections transition through a series of logical states.

```
   [ DISCONNECTED ]
          |
          +=== (Protocol.startListening) ===> [ LISTENING ]
          |                                        |
          |                                (Peer Connects)
          |                                        v
          +=== (Protocol.connect) ========> [ CONNECTING ]
                                                   |
                                            (TCP Binds)
                                                   v
                                             [ CONNECTED ]
                                                   |
                                        (Handshake Negotiated)
                                                   v
                                             [ HANDSHAKE ]
                                                   |
                                       (Socket Closes / Error)
                                                   v
                                            [ DISCONNECTED ]
```

1.  **LISTENING:** Peer A hosts a server socket waiting for a connection. Only one connection is accepted. Once accepted, the server socket is immediately closed to free system resources.
2.  **CONNECTING:** Peer B is establishing the raw TCP handshake with Peer A's listening socket.
3.  **CONNECTED:** The TCP socket is bound. Input/output streams are created, and background receiver threads are launched. Raw byte streams are now operational.
4.  **HANDSHAKE:** The peers exchange metadata and capabilities. Once validated, full-duplex transmission of messages and files is enabled.
5.  **DISCONNECTED:** Triggered on manual disconnection, socket errors, or upon receiving a `DISCONNECT` packet. Connection threads are interrupted, and all partial transfers are cleaned up.

### Reconnection Strategy
The library does not implement automatic infinite reconnections to avoid battery drain or runaway CPU loops on mobile. If a disconnection occurs, the active session is destroyed. To reconnect:
1.  Close the current session via `Protocol.disconnect()`.
2.  Have one peer start listening again, and have the other attempt connection with an exponential backoff retry wrapper in your application code.

---

## Error Handling

All critical protocol events, network timeouts, and stream parsing exceptions are caught, wrapped, and routed to the `onError(Exception)` callback of the `ProtocolListener`.

### Handled Error Scenarios
*   **Marker Mismatches:** If an incoming payload contains an invalid field marker (not `0x00`), the library throws an `IOException` for payload corruption and closes the socket immediately.
*   **Truncated Streams:** If a socket closes before completing a declared packet size or field length, `PacketReader` or `FieldReader` catches the EOF and invokes `onError`.
*   **Write Exceptions:** If a transmission fails due to network loss, the write error is caught, the active connection is torn down, and the error is dispatched to the listener.

---

## Public API Reference

The primary API boundaries are clean, concise, and documented below.

### `Protocol` (Singleton Object)

#### Methods:
```kotlin
fun startListening(port: Int, listener: ProtocolListener, nodeName: String)
```
Starts a background server socket on the specified port. Automatically accepts exactly one peer connection and initializes the full-duplex session. Dispatches exceptions to the listener.

*   `port`: Local port to bind (default: `9999`).
*   `listener`: An implementation of `ProtocolListener` to receive events.
*   `nodeName`: Peer identifier used during handshake.

---

```kotlin
fun connect(host: String, port: Int, listener: ProtocolListener, nodeName: String)
```
Establishes an asynchronous socket connection to a remote listening peer.

*   `host`: IP address of the target peer.
*   `port`: Port of the target peer.
*   `listener`: An implementation of `ProtocolListener` to receive events.
*   `nodeName`: Peer identifier used during handshake.

---

```kotlin
fun sendText(senderName: String, text: String)
```
Sends a text chat message to the connected peer over the active session.
*   **Throws:** `IllegalStateException` if there is no active connection.

---

```kotlin
fun sendFile(file: File, chunkSize: Int = 4096)
```
Slices and streams a local binary file to the connected peer.
*   `file`: The target local file.
*   `chunkSize`: Segment size in bytes (default: `4096`).
*   **Throws:** `IllegalStateException` if there is no active connection.

---

```kotlin
fun disconnect()
```
Gracefully notifies the connected peer via a `DISCONNECT` packet, shuts down active threads, and closes all open socket resources.

---

### `ProtocolListener` (Interface)
All interface methods have empty bodies by default, allowing developers to implement only the events they need.

```kotlin
interface ProtocolListener {
    fun onConnected(host: String, port: Int) {}
    fun onDisconnected() {}
    fun onHandshake(deviceName: String, appName: String, appVersion: String, platform: String, protocolVersion: Short, capabilities: String) {}
    fun onTextReceived(sender: String, text: String) {}
    fun onFileStarted(transferId: Int, fileName: String, fileSize: Long, chunkSize: Int) {}
    fun onFileProgress(transferId: Int, bytesTransferred: Long, totalBytes: Long, percentage: Double, speedBytesPerSec: Long, estimatedRemainingSeconds: Long) {}
    fun onFileCompleted(transferId: Int, fileName: String, totalBytesReceived: Long, savePath: String) {}
    fun onFileCancelled(transferId: Int) {}
    fun onError(exception: Exception) {}
}
```

---

## Best Practices

### 1. Maintain a Single Persistent Connection
To avoid socket bind errors and excessive thread generation:
*   Do not open separate connections for chat and files. Use the same persistent connection. SwiftP2PEngine is full-duplex and handles multiplexed data over a single socket automatically.
*   Once a connection is established, keep it alive. Use heartbeats or let it idle.

### 2. Tuning Chunk Sizes for Large Files
*   **Local Wi-Fi (High Throughput):** Use larger chunk sizes, like `8192` (8 KB) or `16384` (16 KB). This reduces header overhead and maximizes network throughput.
*   **Cellular / Weak Wi-Fi:** Use smaller chunk sizes, like `2048` (2 KB) or `4096` (4 KB). This ensures steadier progress updates and easier recovery if packet loss occurs.

### 3. Avoid Blocking the UI
*   The library automatically routes `ProtocolListener` callbacks to the main thread. However, you should **never** run expensive computations (like heavy image processing or file copying) inside these callbacks, as doing so will freeze the UI.
*   If you need to process a file after receiving it, dispatch the work to a background thread using Kotlin Coroutines:
    ```kotlin
    override fun onFileCompleted(transferId: Int, fileName: String, totalBytes: Long, savePath: String) {
        CoroutineScope(Dispatchers.IO).launch {
            // Run intensive post-processing task here...
            val file = File(savePath)
            processHeavyFile(file)
        }
    }
    ```

---

## Performance Notes

SwiftP2PEngine is optimized for high-speed file transfers on local area networks (LANs).

### Efficiency Details
*   **Binary Packets:** Using 3-byte binary headers reduces protocol overhead compared to HTTP/WebSockets, saving valuable bandwidth.
*   **Zero-Copy Design:** Payloads are read directly into byte buffers and written to disk streams without conversion to strings or intermediate objects. This keeps CPU usage low and prevents garbage collection pauses, which is crucial for smooth performance on Android devices.
*   **Buffered Streams:** The underlying transport layer fully buffers network I/O streams using `BufferedInputStream` and `BufferedOutputStream`. This groups multiple small writes together, optimizing network packet transmission.

---

## Protocol Philosophy

*   **Low Overhead:** Keep headers and field markers minimal. Use raw bytes instead of text tags to keep transmissions as compact as possible.
*   **Extensible Design:** Standardize payload parsing via the TLV field system. Developers can register custom packet types and fields without changing the core connection or framing code.
*   **True Peer-to-Peer:** Avoid server dependencies. Keep communication direct, private, and local.
*   **Persistent TCP Connections:** Avoid the overhead of establishing new connections for every transfer. Use a single persistent connection for all communication.

---

## License

```
Copyright 2026 Bouazza & Swift Contributors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
