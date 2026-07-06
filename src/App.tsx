import { useState, useEffect, useRef } from "react";
import { 
  Terminal, 
  Cpu, 
  FileText, 
  Network, 
  ArrowRight, 
  Layers, 
  ArrowLeftRight, 
  Copy, 
  Check, 
  Play, 
  Square, 
  Wifi, 
  Send, 
  FileCode, 
  Sparkles, 
  Info,
  ChevronRight,
  Database,
  ArrowUpRight,
  RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  PacketType, 
  PacketTypeNames, 
  buildPacket, 
  generateDemoPacket, 
  SimFieldWriter,
  ByteSegment,
  ParsedField,
  KEY_DEVICE_NAME,
  KEY_APP_NAME,
  KEY_APP_VERSION,
  KEY_PLATFORM,
  KEY_PROTOCOL_VERSION,
  KEY_TRANSFER_ID,
  KEY_FILE_NAME,
  KEY_FILE_SIZE,
  KEY_CHUNK_SIZE,
  KEY_CHUNK_NUMBER,
  KEY_BINARY_DATA,
  KEY_TEXT_MESSAGE,
  KEY_SENDER_NAME,
  SerializedPacketResult
} from "./protocol_sim";
import { pythonCodeFiles, kotlinCodeFiles } from "./code_strings";

interface SimLog {
  id: string;
  timestamp: string;
  sender: "client" | "server" | "system";
  message: string;
  packetInfo?: SerializedPacketResult;
}

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<"visualizer" | "simulator" | "code">("visualizer");

  // Visualizer Tab State
  const [selectedType, setSelectedType] = useState<PacketType>(PacketType.HANDSHAKE);
  
  // Custom packet parameters
  const [handshakeParams, setHandshakeParams] = useState({
    deviceName: "Workstation-Alpha",
    appName: "HighSpeedFileDaemon",
    appVersion: "2.4.1",
    platform: "macOS-AppleSilicon",
    protoVersion: 1
  });

  const [textParams, setTextParams] = useState({
    senderName: "Alice",
    message: "Hello network! Protocol built successfully."
  });

  const [fileStartParams, setFileStartParams] = useState({
    transferId: 101,
    fileName: "project_report.pdf",
    fileSize: 1048576, // 1MB
    chunkSize: 16384 // 16KB
  });

  const [fileChunkParams, setFileChunkParams] = useState({
    transferId: 101,
    chunkNumber: 12,
    binaryText: "%PDF-1.4 %binary chunk data..."
  });

  const [fileEndParams, setFileEndParams] = useState({
    transferId: 101
  });

  const [activePacket, setActivePacket] = useState<SerializedPacketResult | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<ByteSegment | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<number | null>(null);

  // Connection Simulator State
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "handshake_pending" | "connected">("disconnected");
  const [clientLogs, setClientLogs] = useState<SimLog[]>([]);
  const [serverLogs, setServerLogs] = useState<SimLog[]>([]);
  const [globalLogs, setGlobalLogs] = useState<SimLog[]>([]);
  
  // Chat input
  const [chatMessage, setChatMessage] = useState("Hi from the simulated client!");
  
  // File Transfer config
  const [transferFileName, setTransferFileName] = useState("holiday_photo.raw");
  const [transferFileSize, setTransferFileSize] = useState(250000); // 250 KB
  const [transferChunkSize, setTransferChunkSize] = useState(50000); // 50 KB
  
  // File stream progression simulation
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferProgress, setTransferProgress] = useState(0);
  const [transferChunksCount, setTransferChunksCount] = useState(0);
  const [activeTransferId, setActiveTransferId] = useState<number>(303);

  // Code Explorer Tab State
  const [selectedLang, setSelectedLang] = useState<"python" | "kotlin">("python");
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  // References
  const clientLogsEndRef = useRef<HTMLDivElement>(null);
  const serverLogsEndRef = useRef<HTMLDivElement>(null);
  const globalLogsEndRef = useRef<HTMLDivElement>(null);

  // Re-generate visualizer packet when any inputs change
  useEffect(() => {
    const writer = new SimFieldWriter();

    switch (selectedType) {
      case PacketType.HANDSHAKE:
        writer.writeString(KEY_DEVICE_NAME, handshakeParams.deviceName);
        writer.writeString(KEY_APP_NAME, handshakeParams.appName);
        writer.writeString(KEY_APP_VERSION, handshakeParams.appVersion);
        writer.writeString(KEY_PLATFORM, handshakeParams.platform);
        writer.writeShort(KEY_PROTOCOL_VERSION, handshakeParams.protoVersion);
        break;

      case PacketType.HANDSHAKE_ACK:
        writer.writeBoolean(0x01, true); // Success status
        writer.writeString(0x02, "Handshake verified. Node authorized.");
        break;

      case PacketType.TEXT:
        writer.writeString(KEY_SENDER_NAME, textParams.senderName);
        writer.writeString(KEY_TEXT_MESSAGE, textParams.message);
        break;

      case PacketType.FILE_START:
        writer.writeInt(KEY_TRANSFER_ID, fileStartParams.transferId);
        writer.writeString(KEY_FILE_NAME, fileStartParams.fileName);
        writer.writeLong(KEY_FILE_SIZE, fileStartParams.fileSize);
        writer.writeInt(KEY_CHUNK_SIZE, fileStartParams.chunkSize);
        break;

      case PacketType.FILE_CHUNK:
        writer.writeInt(KEY_TRANSFER_ID, fileChunkParams.transferId);
        writer.writeInt(KEY_CHUNK_NUMBER, fileChunkParams.chunkNumber);
        writer.writeBytes(KEY_BINARY_DATA, new TextEncoder().encode(fileChunkParams.binaryText));
        break;

      case PacketType.FILE_END:
        writer.writeInt(KEY_TRANSFER_ID, fileEndParams.transferId);
        break;

      case PacketType.PING:
      case PacketType.PONG:
      case PacketType.DISCONNECT:
      default:
        // empty payload
        break;
    }

    const payload = writer.getPayloadBytes();
    const packet = buildPacket(selectedType, payload);
    setActivePacket(packet);
  }, [selectedType, handshakeParams, textParams, fileStartParams, fileChunkParams, fileEndParams]);

  // Scroll logs
  useEffect(() => {
    clientLogsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [clientLogs]);

  useEffect(() => {
    serverLogsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [serverLogs]);

  useEffect(() => {
    globalLogsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [globalLogs]);

  const addLog = (
    sender: "client" | "server" | "system",
    message: string,
    packetInfo?: SerializedPacketResult
  ) => {
    const newLog: SimLog = {
      id: Math.random().toString(),
      timestamp: new Date().toLocaleTimeString(),
      sender,
      message,
      packetInfo
    };

    setGlobalLogs((prev) => [...prev, newLog]);
    if (sender === "client" || sender === "system") {
      setClientLogs((prev) => [...prev, newLog]);
    }
    if (sender === "server" || sender === "system") {
      setServerLogs((prev) => [...prev, newLog]);
    }
  };

  // Connection Simulation Controls
  const handleEstablishConnection = () => {
    setConnectionState("connecting");
    setClientLogs([]);
    setServerLogs([]);
    setGlobalLogs([]);
    
    addLog("system", "⚡ Initiating socket connection (TCP handshaking via standard kernel SYN/ACK)...");
    
    setTimeout(() => {
      setConnectionState("handshake_pending");
      addLog("system", "🟢 Persistent TCP connection established on port 9999.");
      addLog("client", "🔌 Connecting to 127.0.0.1:9999...");
      addLog("server", "📥 Accepted inbound socket connection from client remote port 54122.");
    }, 800);
  };

  const handleSendHandshake = () => {
    if (connectionState !== "handshake_pending") return;

    // Build client handshake
    const writer = new SimFieldWriter();
    writer.writeString(KEY_DEVICE_NAME, "PythonClient-Node");
    writer.writeString(KEY_APP_NAME, "CustomBinaryProtocolPlayground");
    writer.writeString(KEY_APP_VERSION, "1.0.0");
    writer.writeString(KEY_PLATFORM, "Linux/MacOS");
    writer.writeShort(KEY_PROTOCOL_VERSION, 1);
    
    const packet = buildPacket(PacketType.HANDSHAKE, writer.getPayloadBytes());
    
    addLog("client", "📤 Sent HANDSHAKE packet", packet);
    
    setTimeout(() => {
      addLog("server", "📥 Received HANDSHAKE packet. Parsing fields...", packet);
      addLog("server", "⚙️ Client Handshake Verified: Protocol Version = 1, Platform = Linux/MacOS");
      
      // Send Handshake ACK
      const ackWriter = new SimFieldWriter();
      ackWriter.writeBoolean(0x01, true);
      ackWriter.writeString(0x02, "Server Ready");
      const ackPacket = buildPacket(PacketType.HANDSHAKE_ACK, ackWriter.getPayloadBytes());
      
      addLog("server", "📤 Sent HANDSHAKE_ACK approved packet", ackPacket);
      
      setTimeout(() => {
        addLog("client", "📥 Received HANDSHAKE_ACK from server. Handshake APPROVED!", ackPacket);
        setConnectionState("connected");
      }, 500);
    }, 500);
  };

  const handleSendPing = () => {
    if (connectionState !== "connected") return;

    const pingPacket = buildPacket(PacketType.PING, new Uint8Array());
    addLog("client", "📤 Sent Heartbeat PING packet", pingPacket);

    setTimeout(() => {
      addLog("server", "📥 Received PING. Replying with PONG.", pingPacket);
      
      const pongPacket = buildPacket(PacketType.PONG, new Uint8Array());
      addLog("server", "📤 Sent PONG response packet", pongPacket);

      setTimeout(() => {
        addLog("client", "📥 Received PONG response. Heartbeat OK.", pongPacket);
      }, 400);
    }, 400);
  };

  const handleSendChatMessage = () => {
    if (!chatMessage.trim() || connectionState !== "connected") return;

    const writer = new SimFieldWriter();
    writer.writeString(KEY_SENDER_NAME, "Alice (Client)");
    writer.writeString(KEY_TEXT_MESSAGE, chatMessage);
    const packet = buildPacket(PacketType.TEXT, writer.getPayloadBytes());

    addLog("client", `📤 Sent Chat message: "${chatMessage}"`, packet);
    
    setTimeout(() => {
      addLog("server", `📥 Received TEXT packet from sender 'Alice (Client)'. Payload parsed: "${chatMessage}"`, packet);
    }, 500);
    
    setChatMessage("");
  };

  const handleStreamFile = () => {
    if (connectionState !== "connected" || isTransferring) return;

    setIsTransferring(true);
    setTransferProgress(0);
    setTransferChunksCount(0);
    const tid = activeTransferId;
    setActiveTransferId(prev => prev + 1);

    // 1. Send FILE_START
    const startWriter = new SimFieldWriter();
    startWriter.writeInt(KEY_TRANSFER_ID, tid);
    startWriter.writeString(KEY_FILE_NAME, transferFileName);
    startWriter.writeLong(KEY_FILE_SIZE, transferFileSize);
    startWriter.writeInt(KEY_CHUNK_SIZE, transferChunkSize);
    const startPacket = buildPacket(PacketType.FILE_START, startWriter.getPayloadBytes());

    addLog("client", `📤 Initiating file stream. FILE_START for '${transferFileName}' (${transferFileSize} bytes)`, startPacket);

    setTimeout(() => {
      addLog("server", `📥 Received FILE_START. Registered transfer ID ${tid}. Saving to 'received_files/${transferFileName}'`, startPacket);
      
      // Start chunking loop
      let currentChunk = 0;
      let bytesSent = 0;
      const totalChunks = Math.ceil(transferFileSize / transferChunkSize);
      
      const interval = setInterval(() => {
        if (currentChunk < totalChunks) {
          currentChunk++;
          const currentChunkSize = Math.min(transferChunkSize, transferFileSize - bytesSent);
          bytesSent += currentChunkSize;
          
          // Generate chunk bytes
          const chunkWriter = new SimFieldWriter();
          chunkWriter.writeInt(KEY_TRANSFER_ID, tid);
          chunkWriter.writeInt(KEY_CHUNK_NUMBER, currentChunk);
          chunkWriter.writeBytes(KEY_BINARY_DATA, new TextEncoder().encode(`[Data Chunk ${currentChunk} of size ${currentChunkSize}]`));
          const chunkPacket = buildPacket(PacketType.FILE_CHUNK, chunkWriter.getPayloadBytes());

          addLog("client", `📤 Sending Chunk #${currentChunk}/${totalChunks} (${currentChunkSize} bytes)`, chunkPacket);
          
          // Mimic receiver parsing chunk on-the-fly
          setTimeout(() => {
            const pct = (bytesSent / transferFileSize) * 100;
            setTransferProgress(pct);
            setTransferChunksCount(currentChunk);
            addLog("server", `📥 Received Chunk #${currentChunk} for transfer ID ${tid}. Saved ${currentChunkSize} bytes to disk. (${pct.toFixed(0)}% received)`);
          }, 80);

        } else {
          // Send FILE_END
          clearInterval(interval);
          const endWriter = new SimFieldWriter();
          endWriter.writeInt(KEY_TRANSFER_ID, tid);
          const endPacket = buildPacket(PacketType.FILE_END, endWriter.getPayloadBytes());

          addLog("client", `📤 Finished streaming all chunks. Sent FILE_END.`, endPacket);

          setTimeout(() => {
            addLog("server", `📥 Received FILE_END for transfer ID ${tid}. Reassembly successful! File verified on disk.`, endPacket);
            setIsTransferring(false);
          }, 300);
        }
      }, 350);

    }, 500);
  };

  const handleDisconnect = () => {
    if (connectionState === "disconnected") return;

    if (connectionState === "connected") {
      const disconnectPacket = buildPacket(PacketType.DISCONNECT, new Uint8Array());
      addLog("client", "📤 Transmitting DISCONNECT packet notifications...", disconnectPacket);
    }
    
    setTimeout(() => {
      addLog("system", "🔴 Connection closed. TCP socket destroyed.");
      setConnectionState("disconnected");
      setIsTransferring(false);
    }, 400);
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Color mappings for roles to make the hex dump look exceptionally clean and educational
  const getRoleColors = (role: string) => {
    switch (role) {
      case "header-type":
        return {
          bg: "bg-purple-950/40 hover:bg-purple-900/50 border-purple-800 text-purple-300",
          text: "text-purple-400",
          border: "border-purple-600",
          badge: "bg-purple-900/50 text-purple-200 border-purple-700"
        };
      case "header-length":
        return {
          bg: "bg-fuchsia-950/40 hover:bg-fuchsia-900/50 border-fuchsia-800 text-fuchsia-300",
          text: "text-fuchsia-400",
          border: "border-fuchsia-600",
          badge: "bg-fuchsia-900/50 text-fuchsia-200 border-fuchsia-700"
        };
      case "field-marker":
        return {
          bg: "bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-800 text-emerald-300",
          text: "text-emerald-400",
          border: "border-emerald-600",
          badge: "bg-emerald-900/50 text-emerald-200 border-emerald-700"
        };
      case "field-key":
        return {
          bg: "bg-amber-950/40 hover:bg-amber-900/50 border-amber-800 text-amber-300",
          text: "text-amber-400",
          border: "border-amber-600",
          badge: "bg-amber-900/50 text-amber-200 border-amber-700"
        };
      case "field-length":
        return {
          bg: "bg-orange-950/40 hover:bg-orange-900/50 border-orange-800 text-orange-300",
          text: "text-orange-400",
          border: "border-orange-600",
          badge: "bg-orange-900/50 text-orange-200 border-orange-700"
        };
      case "field-value":
        return {
          bg: "bg-teal-950/40 hover:bg-teal-900/50 border-teal-800 text-teal-300",
          text: "text-teal-400",
          border: "border-teal-600",
          badge: "bg-teal-900/50 text-teal-200 border-teal-700"
        };
      default:
        return {
          bg: "bg-slate-900 hover:bg-slate-850 border-slate-700 text-slate-300",
          text: "text-slate-400",
          border: "border-slate-600",
          badge: "bg-slate-800 text-slate-200 border-slate-600"
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-black">
      
      {/* Dynamic Header */}
      <header className="border-b border-slate-800 bg-[#161b22]/90 backdrop-blur sticky top-0 z-50 px-6 py-4 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-teal-500 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-teal-950/50">
            <Network className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Custom Binary TCP Protocol</h1>
              <span className="bg-teal-900/40 text-teal-300 border border-teal-800/60 text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full">Python Core</span>
            </div>
            <p className="text-xs text-slate-400">Object-Oriented, High-Speed Binary Streaming Architecture</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button 
            onClick={() => setActiveTab("visualizer")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "visualizer" 
                ? "bg-slate-800 text-teal-400 border border-slate-700/50 shadow-md" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Packet Visualizer</span>
          </button>
          
          <button 
            onClick={() => setActiveTab("simulator")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "simulator" 
                ? "bg-slate-800 text-teal-400 border border-slate-700/50 shadow-md" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Socket Simulator</span>
          </button>

          <button 
            onClick={() => setActiveTab("code")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "code" 
                ? "bg-slate-800 text-teal-400 border border-slate-700/50 shadow-md" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Python Source Code</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full flex flex-col gap-6">

        {/* ==================== TAB 1: VISUALIZER ==================== */}
        {activeTab === "visualizer" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left Col: Builder Panel (5 cols) */}
            <div className="lg:col-span-5 bg-[#161b22] border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 shadow-xl">
              <div>
                <h2 className="text-md font-semibold text-white flex items-center gap-2 mb-1">
                  <Cpu className="w-4 h-4 text-teal-400" />
                  Packet Builder Configuration
                </h2>
                <p className="text-xs text-slate-400">Assemble customized binary packet parameters to generate real-time wire-format serialization bytes.</p>
              </div>

              {/* Packet Type Selection */}
              <div>
                <label className="text-xs text-slate-400 block mb-2 font-medium">Select Packet Type (1 Byte Header):</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(PacketTypeNames).map(([val, name]) => {
                    const typeNum = Number(val);
                    return (
                      <button
                        key={typeNum}
                        onClick={() => setSelectedType(typeNum)}
                        className={`text-[11px] py-2 px-1 rounded-lg border text-center transition-all ${
                          selectedType === typeNum
                            ? "bg-teal-950/40 text-teal-300 border-teal-500 font-semibold"
                            : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300"
                        }`}
                      >
                        <div>{name}</div>
                        <div className="text-[9px] opacity-60 font-mono">0x{typeNum.toString(16).toUpperCase().padStart(2, "0")}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Parameter Inputs based on selected packet */}
              <div className="border-t border-slate-800 pt-5 flex-1">
                <h3 className="text-xs uppercase tracking-wider font-semibold text-teal-400 mb-4 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Payload Field Parameters
                </h3>

                {selectedType === PacketType.HANDSHAKE && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Device Name (Key 0x01, String):</label>
                      <input 
                        type="text" 
                        value={handshakeParams.deviceName}
                        onChange={(e) => setHandshakeParams({ ...handshakeParams, deviceName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Application Name (Key 0x02, String):</label>
                      <input 
                        type="text" 
                        value={handshakeParams.appName}
                        onChange={(e) => setHandshakeParams({ ...handshakeParams, appName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">App Version (0x03):</label>
                        <input 
                          type="text" 
                          value={handshakeParams.appVersion}
                          onChange={(e) => setHandshakeParams({ ...handshakeParams, appVersion: e.target.value })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Protocol Version (0x05, Short):</label>
                        <input 
                          type="number" 
                          value={handshakeParams.protoVersion}
                          onChange={(e) => setHandshakeParams({ ...handshakeParams, protoVersion: parseInt(e.target.value) || 1 })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Platform (Key 0x04, String):</label>
                      <input 
                        type="text" 
                        value={handshakeParams.platform}
                        onChange={(e) => setHandshakeParams({ ...handshakeParams, platform: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                )}

                {selectedType === PacketType.HANDSHAKE_ACK && (
                  <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 text-xs space-y-2">
                    <p className="font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Check className="w-4 h-4" /> Handshake Acknowledgement Format
                    </p>
                    <p className="text-slate-400 leading-relaxed">
                      Auto-constructs a standard verification reply payload containing:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-slate-400">
                      <li><strong className="text-white">Key 0x01 (Boolean)</strong>: Connection status approved (True)</li>
                      <li><strong className="text-white">Key 0x02 (String)</strong>: Server validation statement ("Handshake verified. Node authorized.")</li>
                    </ul>
                  </div>
                )}

                {selectedType === PacketType.TEXT && (
                  <div className="space-y-4">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Sender Name (Key 0x15, String):</label>
                      <input 
                        type="text" 
                        value={textParams.senderName}
                        onChange={(e) => setTextParams({ ...textParams, senderName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Text Message (Key 0x14, String):</label>
                      <textarea 
                        rows={3}
                        value={textParams.message}
                        onChange={(e) => setTextParams({ ...textParams, message: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500 resize-none"
                      />
                    </div>
                  </div>
                )}

                {selectedType === PacketType.FILE_START && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Transfer ID (0x0A, Int):</label>
                        <input 
                          type="number" 
                          value={fileStartParams.transferId}
                          onChange={(e) => setFileStartParams({ ...fileStartParams, transferId: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Chunk Size (0x0D, Int):</label>
                        <input 
                          type="number" 
                          value={fileStartParams.chunkSize}
                          onChange={(e) => setFileStartParams({ ...fileStartParams, chunkSize: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">File Name (Key 0x0B, String):</label>
                      <input 
                        type="text" 
                        value={fileStartParams.fileName}
                        onChange={(e) => setFileStartParams({ ...fileStartParams, fileName: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">File Size (Key 0x0C, 64-bit Long Int):</label>
                      <input 
                        type="number" 
                        value={fileStartParams.fileSize}
                        onChange={(e) => setFileStartParams({ ...fileStartParams, fileSize: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                )}

                {selectedType === PacketType.FILE_CHUNK && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Transfer ID (0x0A, Int):</label>
                        <input 
                          type="number" 
                          value={fileChunkParams.transferId}
                          onChange={(e) => setFileChunkParams({ ...fileChunkParams, transferId: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">Chunk Number (0x0E, Int):</label>
                        <input 
                          type="number" 
                          value={fileChunkParams.chunkNumber}
                          onChange={(e) => setFileChunkParams({ ...fileChunkParams, chunkNumber: parseInt(e.target.value) || 0 })}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Binary Payload Preview (Key 0x0F, Bytes):</label>
                      <input 
                        type="text" 
                        value={fileChunkParams.binaryText}
                        onChange={(e) => setFileChunkParams({ ...fileChunkParams, binaryText: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>
                  </div>
                )}

                {selectedType === PacketType.FILE_END && (
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Transfer ID (Key 0x0A, Int):</label>
                    <input 
                      type="number" 
                      value={fileEndParams.transferId}
                      onChange={(e) => setFileEndParams({ ...fileEndParams, transferId: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                    />
                  </div>
                )}

                {(selectedType === PacketType.PING || selectedType === PacketType.PONG || selectedType === PacketType.DISCONNECT) && (
                  <div className="bg-slate-900/40 rounded-xl p-4 border border-slate-800 text-slate-400 text-xs leading-relaxed space-y-2">
                    <p className="font-semibold text-amber-400 flex items-center gap-1.5">
                      <Info className="w-4 h-4" /> Minimal Header Packet
                    </p>
                    <p>
                      These packets require zero payload bytes. They contain only the fixed 3-byte header:
                    </p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Type (1 byte) = <code className="text-white">0x0{selectedType}</code></li>
                      <li>Payload Length (2 bytes) = <code className="text-white">0x0000</code></li>
                    </ul>
                    <p>
                      Ideal for low-overhead, latency-sensitive heartbeats and connection close events.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Hex Dump Inspector & Structural Decoder (7 cols) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Packed Byte Stream Representation */}
              <div className="bg-[#161b22] border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
                  <div>
                    <h2 className="text-md font-semibold text-white flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-purple-400" />
                      Live Custom Serialization Hex Dump
                    </h2>
                    <p className="text-xs text-slate-400">Total Size: <span className="text-white font-mono">{activePacket?.totalLength || 0} bytes</span> (Header: 3B | Payload: {activePacket?.payloadLength || 0}B)</p>
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    <span className="flex items-center gap-1 text-purple-400"><span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>Type</span>
                    <span className="flex items-center gap-1 text-fuchsia-400"><span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500"></span>Len</span>
                    <span className="flex items-center gap-1 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Marker</span>
                    <span className="flex items-center gap-1 text-amber-400"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Key</span>
                    <span className="flex items-center gap-1 text-orange-400"><span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>FieldLen</span>
                    <span className="flex items-center gap-1 text-teal-400"><span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>Value</span>
                  </div>
                </div>

                {/* Hex Dump Board */}
                <div className="bg-[#0d1117] border border-slate-850 rounded-xl p-4 font-mono text-sm leading-relaxed overflow-x-auto min-h-[140px] flex flex-col justify-between">
                  {activePacket && activePacket.segments.length > 0 ? (
                    <div>
                      {/* Hex dump grid */}
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {activePacket.segments.map((segment) => {
                          const colors = getRoleColors(segment.role);
                          const isHovered = hoveredSegment?.index === segment.index;
                          
                          return (
                            <div
                              key={segment.index}
                              onMouseEnter={() => setHoveredSegment(segment)}
                              onMouseLeave={() => setHoveredSegment(null)}
                              className={`w-9 h-9 flex items-center justify-center rounded-lg border text-center cursor-help transition-all duration-150 ${colors.bg} ${
                                isHovered ? `${colors.border} scale-110 shadow-lg shadow-black/60 font-bold z-10` : "border-transparent"
                              }`}
                            >
                              {segment.hex}
                            </div>
                          );
                        })}
                      </div>

                      {/* ASCII interpretation line */}
                      <div className="border-t border-slate-800/80 pt-3 flex flex-wrap gap-1 font-mono text-slate-500 select-none">
                        <span className="text-xs text-slate-400 mr-2">ASCII:</span>
                        {activePacket.segments.map((segment) => {
                          const isHovered = hoveredSegment?.index === segment.index;
                          return (
                            <span 
                              key={segment.index}
                              className={`transition-all duration-150 ${isHovered ? "text-teal-400 font-bold scale-125" : ""}`}
                            >
                              {segment.char}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 flex items-center justify-center py-8">
                      No bytes generated yet. Configure options in the left panel.
                    </div>
                  )}
                </div>

                {/* Dynamic Byte Inspector Tooltip */}
                <div className="mt-4 bg-slate-900/90 rounded-xl border border-slate-800 p-4 min-h-[90px] flex items-start gap-3">
                  <div className="mt-1 bg-slate-800 p-1.5 rounded-lg border border-slate-700">
                    <Info className="w-4 h-4 text-teal-400" />
                  </div>
                  <div>
                    {hoveredSegment ? (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-slate-400">OFFSET: {hoveredSegment.index}</span>
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${getRoleColors(hoveredSegment.role).badge}`}>
                            {hoveredSegment.role.replace("-", " ")}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-white mb-0.5">
                          Byte Value: <code className="text-teal-300">0x{hoveredSegment.hex}</code> ({hoveredSegment.value} in decimal)
                        </p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {hoveredSegment.meta}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Interactive byte decoder</p>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Hover your cursor over any byte in the hexagonal grid above to decode its alignment, field roles, values, and precise location within the custom protocol stream.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Parsed Field breakdown */}
              <div className="bg-[#161b22] border border-slate-800 rounded-2xl p-6 shadow-xl flex-1">
                <h2 className="text-md font-semibold text-white flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Custom Field Decoder Output
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  How a Python <code className="bg-slate-900 px-1.5 py-0.5 rounded text-white border border-slate-800">FieldReader</code> scans the byte array, validates boundaries, and populates the field dictionary:
                </p>

                {activePacket && activePacket.fields.length > 0 ? (
                  <div className="space-y-3">
                    {activePacket.fields.map((field) => (
                      <div 
                        key={field.key}
                        onClick={() => setSelectedFieldKey(selectedFieldKey === field.key ? null : field.key)}
                        className={`border rounded-xl p-3.5 transition-all cursor-pointer ${
                          selectedFieldKey === field.key 
                            ? "bg-slate-900 border-teal-500 shadow-md shadow-teal-950/20" 
                            : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-[11px] font-bold bg-amber-950/50 text-amber-300 border border-amber-800 px-2 py-0.5 rounded">
                              Key 0x{field.key.toString(16).toUpperCase().padStart(2, "0")}
                            </span>
                            <span className="text-sm font-semibold text-white">{field.keyName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-slate-400">Len: {field.length}B</span>
                            <span className="text-[10px] uppercase font-bold tracking-widest bg-teal-950/60 text-teal-300 border border-teal-800/60 px-1.5 py-0.5 rounded">
                              {field.type}
                            </span>
                          </div>
                        </div>

                        {selectedFieldKey === field.key ? (
                          <div className="space-y-2 mt-2 pt-2 border-t border-slate-800 text-xs text-slate-400">
                            <div className="flex justify-between">
                              <span>Raw Encoded Bytes:</span>
                              <span className="font-mono text-white">
                                {Array.from(field.rawBytes).map((b: number) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ")}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Decoded Value:</span>
                              <span className="font-semibold text-teal-300">
                                {typeof field.decodedValue === "boolean" 
                                  ? (field.decodedValue ? "True" : "False") 
                                  : field.decodedValue.toString()}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 italic mt-1">
                              Parsed via corresponding Python method: <code className="bg-slate-950 text-slate-300 px-1 py-0.5 rounded">reader.get_{field.type}(0x{field.key.toString(16).toUpperCase()})</code>
                            </p>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400">Decoded:</span>
                            <span className="font-mono text-teal-300 truncate max-w-[280px]">
                              {typeof field.decodedValue === "boolean" 
                                ? (field.decodedValue ? "True" : "False") 
                                : field.decodedValue.toString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
                    This packet type contains zero fields (empty payload).
                  </div>
                )}
              </div>
            </div>
          </div>
        )}


        {/* ==================== TAB 2: SIMULATOR ==================== */}
        {activeTab === "simulator" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            
            {/* Top/Left panel: Controls (4 cols) */}
            <div className="xl:col-span-4 bg-[#161b22] border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-6">
              <div>
                <h2 className="text-md font-semibold text-white flex items-center gap-2 mb-1">
                  <Wifi className="w-4 h-4 text-teal-400" />
                  Connection Controller
                </h2>
                <p className="text-xs text-slate-400">Simulate a real-time multi-threaded Client-Server socket connection using the custom binary protocol.</p>
              </div>

              {/* Status display */}
              <div className="bg-slate-900 rounded-xl p-4 border border-slate-850 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block uppercase tracking-wider font-semibold">Active State</span>
                  <span className={`text-sm font-bold flex items-center gap-2 mt-0.5 ${
                    connectionState === "disconnected" ? "text-slate-400" :
                    connectionState === "connecting" ? "text-amber-400" :
                    connectionState === "handshake_pending" ? "text-blue-400" :
                    "text-emerald-400"
                  }`}>
                    <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                      connectionState === "disconnected" ? "bg-slate-500" :
                      connectionState === "connecting" ? "bg-amber-500" :
                      connectionState === "handshake_pending" ? "bg-blue-500" :
                      "bg-emerald-500"
                    }`}></span>
                    {connectionState === "disconnected" && "Socket Disconnected"}
                    {connectionState === "connecting" && "SYN/ACK Handshaking..."}
                    {connectionState === "handshake_pending" && "TCP Connected (No Handshake)"}
                    {connectionState === "connected" && "Authenticated (Active Session)"}
                  </span>
                </div>

                {connectionState !== "disconnected" && (
                  <button 
                    onClick={handleDisconnect}
                    className="p-2 rounded-lg bg-red-950/30 text-red-400 hover:bg-red-950/60 border border-red-900/50 text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                )}
              </div>

              {/* Action buttons list */}
              <div className="space-y-4 flex-1">
                {connectionState === "disconnected" && (
                  <button
                    onClick={handleEstablishConnection}
                    className="w-full bg-gradient-to-r from-teal-500 to-indigo-600 hover:from-teal-400 hover:to-indigo-500 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-lg shadow-teal-950/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <Play className="w-4 h-4 fill-white text-white" />
                    Establish Raw TCP Socket
                  </button>
                )}

                {connectionState === "handshake_pending" && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded-lg p-3 leading-relaxed">
                      💡 <strong>Next Step:</strong> Client is connected on the TCP layer but server requires the protocol-level <code>HANDSHAKE</code> packet containing app credentials.
                    </p>
                    <button
                      onClick={handleSendHandshake}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                      <Sparkles className="w-4 h-4" />
                      Transmit Handshake Packet
                    </button>
                  </div>
                )}

                {connectionState === "connected" && (
                  <div className="space-y-5">
                    
                    {/* Ping / Pong option */}
                    <div className="border-b border-slate-800 pb-4">
                      <label className="text-[10px] font-semibold text-slate-400 block mb-2 uppercase tracking-wider">Heartbeat Utility</label>
                      <button
                        onClick={handleSendPing}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg py-2 px-3 text-xs font-semibold flex items-center justify-center gap-2 transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                        Send Heartbeat PING
                      </button>
                    </div>

                    {/* Chat Text message option */}
                    <div className="border-b border-slate-800 pb-4">
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1.5 uppercase tracking-wider">Chat Messaging</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={chatMessage}
                          onChange={(e) => setChatMessage(e.target.value)}
                          placeholder="Type simulated message..."
                          onKeyDown={(e) => e.key === "Enter" && handleSendChatMessage()}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                        />
                        <button
                          onClick={handleSendChatMessage}
                          className="bg-teal-600 hover:bg-teal-500 p-2 rounded-lg text-white"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Streaming File transfer simulation */}
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-2 uppercase tracking-wider">High-Speed Wi-Fi File Streaming</label>
                      <div className="space-y-3 bg-slate-900/60 border border-slate-850 p-4 rounded-xl">
                        <div>
                          <label className="text-[10px] text-slate-400 block mb-1">File Name:</label>
                          <input
                            type="text"
                            value={transferFileName}
                            onChange={(e) => setTransferFileName(e.target.value)}
                            disabled={isTransferring}
                            className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none disabled:opacity-50"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-1">File Size:</label>
                            <select
                              value={transferFileSize}
                              onChange={(e) => setTransferFileSize(parseInt(e.target.value))}
                              disabled={isTransferring}
                              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none disabled:opacity-50"
                            >
                              <option value={100000}>100 KB</option>
                              <option value={250000}>250 KB</option>
                              <option value={500000}>500 KB</option>
                              <option value={1000000}>1.0 MB</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-1">Chunk Size:</label>
                            <select
                              value={transferChunkSize}
                              onChange={(e) => setTransferChunkSize(parseInt(e.target.value))}
                              disabled={isTransferring}
                              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none disabled:opacity-50"
                            >
                              <option value={20000}>20 KB</option>
                              <option value={50000}>50 KB</option>
                              <option value={100000}>100 KB</option>
                              <option value={200000}>200 KB</option>
                            </select>
                          </div>
                        </div>

                        {isTransferring ? (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between text-[10px] text-slate-400">
                              <span>Streaming Chunks...</span>
                              <span className="font-semibold text-teal-400">{transferProgress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                              <div 
                                className="bg-gradient-to-r from-teal-500 to-indigo-500 h-full transition-all duration-150"
                                style={{ width: `${transferProgress}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-slate-500 block text-right font-mono">Chunk #{transferChunksCount} sent</span>
                          </div>
                        ) : (
                          <button
                            onClick={handleStreamFile}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                            Stream Inbound File
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            </div>

            {/* Right/Bottom panel: Live Dual Terminal Consoles (8 cols) */}
            <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Client Terminal Console */}
              <div className="bg-[#161b22] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-[520px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                    <h3 className="text-sm font-semibold text-white">Client Console Logs</h3>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">client.py</span>
                </div>

                <div className="flex-1 bg-[#0d1117] rounded-xl border border-slate-850 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-3 scrollbar-thin">
                  {clientLogs.length === 0 ? (
                    <div className="text-slate-600 h-full flex items-center justify-center italic text-center py-12">
                      Awaiting connection setup... Click "Establish Raw TCP Socket" to start.
                    </div>
                  ) : (
                    clientLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`p-2 rounded-lg border transition-all ${
                          log.sender === "system" 
                            ? "bg-slate-900/60 border-slate-800/50 text-slate-400" 
                            : "bg-blue-950/20 border-blue-900/30 text-slate-200 hover:border-blue-800/40"
                        }`}
                      >
                        <div className="flex justify-between items-center opacity-60 text-[9px] mb-1">
                          <span>{log.sender.toUpperCase()}</span>
                          <span>{log.timestamp}</span>
                        </div>
                        <p>{log.message}</p>
                        
                        {log.packetInfo && (
                          <div className="mt-2 pt-2 border-t border-slate-800/40 text-[10px] text-slate-400 flex justify-between items-center">
                            <span>Packet Size: <strong className="text-white font-mono">{log.packetInfo.totalLength} bytes</strong></span>
                            <span className="bg-blue-900/40 text-blue-300 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold">
                              {log.packetInfo.typeName}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={clientLogsEndRef} />
                </div>
              </div>

              {/* Server Terminal Console */}
              <div className="bg-[#161b22] border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col h-[520px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <h3 className="text-sm font-semibold text-white">Server Console Logs</h3>
                  </div>
                  <span className="font-mono text-[10px] text-slate-500">server.py</span>
                </div>

                <div className="flex-1 bg-[#0d1117] rounded-xl border border-slate-850 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-3 scrollbar-thin">
                  {serverLogs.length === 0 ? (
                    <div className="text-slate-600 h-full flex items-center justify-center italic text-center py-12">
                      Awaiting connection setup... Server listening on port 9999.
                    </div>
                  ) : (
                    serverLogs.map((log) => (
                      <div 
                        key={log.id} 
                        className={`p-2 rounded-lg border transition-all ${
                          log.sender === "system" 
                            ? "bg-slate-900/60 border-slate-800/50 text-slate-400" 
                            : "bg-emerald-950/20 border-emerald-900/30 text-slate-200 hover:border-emerald-800/40"
                        }`}
                      >
                        <div className="flex justify-between items-center opacity-60 text-[9px] mb-1">
                          <span>{log.sender.toUpperCase()}</span>
                          <span>{log.timestamp}</span>
                        </div>
                        <p>{log.message}</p>

                        {log.packetInfo && (
                          <div className="mt-2 pt-2 border-t border-slate-800/40 text-[10px] text-slate-400 flex justify-between items-center">
                            <span>Packet Size: <strong className="text-white font-mono">{log.packetInfo.totalLength} bytes</strong></span>
                            <span className="bg-emerald-900/40 text-emerald-300 px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold">
                              {log.packetInfo.typeName}
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={serverLogsEndRef} />
                </div>
              </div>

            </div>
          </div>
        )}


        {/* ==================== TAB 3: CODE EXPLORER ==================== */}
        {activeTab === "code" && (
          <div className="space-y-6">
            {/* Language Selection bar */}
            <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 max-w-md mx-auto">
              <button
                onClick={() => {
                  setSelectedLang("python");
                  setSelectedFileIdx(0);
                }}
                className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  selectedLang === "python"
                    ? "bg-teal-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Cpu className="w-4 h-4" />
                Python Codebase
              </button>
              <button
                onClick={() => {
                  setSelectedLang("kotlin");
                  setSelectedFileIdx(0);
                }}
                className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  selectedLang === "kotlin"
                    ? "bg-teal-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Network className="w-4 h-4" />
                Android Kotlin Library
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* File navigator tree (3 cols) */}
              <div className="lg:col-span-3 bg-[#161b22] border border-slate-800 rounded-2xl p-5 shadow-xl">
                <h3 className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-4 flex items-center gap-2">
                  <Database className="w-3.5 h-3.5" />
                  Workspace Files
                </h3>
                
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto scrollbar-thin">
                  {(selectedLang === "python" ? pythonCodeFiles : kotlinCodeFiles).map((file, idx) => {
                    const isSelected = selectedFileIdx === idx;
                    return (
                      <button
                        key={file.name}
                        onClick={() => setSelectedFileIdx(idx)}
                        className={`w-full text-left flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          isSelected 
                            ? "bg-teal-950/40 text-teal-300 border-teal-800 shadow-md" 
                            : "bg-slate-900 border-slate-850 text-slate-400 hover:border-slate-800 hover:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className={`w-4 h-4 shrink-0 ${isSelected ? "text-teal-400" : "text-slate-500"}`} />
                          <span className="truncate">{file.name}</span>
                        </div>
                        <ChevronRight className="w-3 h-3 opacity-60 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* High fidelity code reader and detailer (9 cols) */}
              <div className="lg:col-span-9 bg-[#161b22] border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
                
                {/* Summary metadata header */}
                <div className="flex flex-wrap gap-4 items-start justify-between border-b border-slate-800 pb-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <h2 className="text-lg font-bold text-white font-mono truncate">
                        {(selectedLang === "python" ? pythonCodeFiles : kotlinCodeFiles)[selectedFileIdx]?.name}
                      </h2>
                      <span className="text-[10px] font-bold tracking-widest uppercase bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded shrink-0">
                        {selectedLang}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {(selectedLang === "python" ? pythonCodeFiles : kotlinCodeFiles)[selectedFileIdx]?.description}
                    </p>
                  </div>

                  <button
                    onClick={() => copyToClipboard((selectedLang === "python" ? pythonCodeFiles : kotlinCodeFiles)[selectedFileIdx]?.code || "")}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all shrink-0 ${
                      copied 
                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-800" 
                        : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy Code
                      </>
                    )}
                  </button>
                </div>

                {/* Custom styled code box */}
                <div className="relative rounded-xl border border-slate-850 overflow-hidden">
                  <div className="absolute top-3 right-4 flex items-center gap-2 bg-[#0d1117] px-2.5 py-1 rounded-md border border-slate-850 z-10 text-[10px] font-mono text-slate-500">
                    <span>UTF-8 ENCODING</span>
                  </div>
                  <pre className="p-5 overflow-auto bg-[#0d1117] text-slate-300 font-mono text-xs leading-relaxed max-h-[580px] scrollbar-thin">
                    <code>{(selectedLang === "python" ? pythonCodeFiles : kotlinCodeFiles)[selectedFileIdx]?.code}</code>
                  </pre>
                </div>

                {/* Informative details banner */}
                <div className="bg-slate-900/60 rounded-xl border border-slate-850 p-4 flex gap-3 items-start text-xs text-slate-400 leading-relaxed">
                  <div className="bg-slate-800 p-1.5 rounded-lg border border-slate-700 text-teal-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-white">Architectural Highlight</p>
                    {selectedLang === "python" ? (
                      <div>
                        {selectedFileIdx === 0 && (
                          <p>This constants specification establishes a robust layout schema. Key boundaries (like key fields) are partitioned so that numeric parsing can map instantly to logical components without string-matching delays, maintaining peak speed over high-throughput channels.</p>
                        )}
                        {selectedFileIdx === 1 && (
                          <p>Using integer enumerations allows the packet header parser to read a single byte, match it directly against the integer value, and route it. This eliminates the parsing overhead of text-based formats like JSON or XML.</p>
                        )}
                        {selectedFileIdx === 2 && (
                          <p>The <code>Field</code> class implements direct packing utilizing Python's <code>struct.pack</code> module. It ensures big-endian standard format (using the <code>&gt;</code> character), securing flawless binary alignment when transmitting across different CPU architectures.</p>
                        )}
                        {selectedFileIdx === 3 && (
                          <p>The <code>FieldWriter</code> adopts the Builder design pattern. By maintaining a private mutable <code>bytearray</code> and chaining methods, we avoid recreating buffers repeatedly, which reduces garbage collector load during heavy file chunk streaming.</p>
                        )}
                        {selectedFileIdx === 4 && (
                          <p>The <code>FieldReader</code> scans the binary chunk, verifying every field's <code>FIELD_MARKER</code>. If a packet is intercepted or corrupted, marker mismatch raises an immediate parsing error, preventing corrupt data from compromising state.</p>
                        )}
                        {selectedFileIdx === 5 && (
                          <p>The <code>Packet</code> represents the main network frame. Its static <code>receive_from_socket</code> method implements exact streaming frame reads. Since TCP is a streaming byte protocol and not packet-oriented, it handles chunked TCP reads until the designated packet length is fulfilled.</p>
                        )}
                        {selectedFileIdx === 6 && (
                          <p>The event-driven <code>Dispatcher</code> provides standard inheritance hooks. This lets other modules listen to specific packet signals (like <code>on_text</code> or <code>on_file_chunk</code>) without messing with socket read and framing layers.</p>
                        )}
                        {selectedFileIdx === 7 && (
                          <p>The <code>Connection</code> class starts a background daemon receiver thread and coordinates outbound writes using a thread lock. This lets you send a file and chat in the foreground while simultaneously listening for heartbeats in the background.</p>
                        )}
                        {selectedFileIdx === 8 && (
                          <p>The multi-threaded server uses standard socket bindings and spins up a dedicated connection instance for every accepted TCP client. It re-assembles files safely in the <code>received_files/</code> directory, neutralizing path-traversal attacks with <code>os.path.basename</code> validation.</p>
                        )}
                        {selectedFileIdx === 9 && (
                          <p>The client performs full network sequences. It establishes connections, wraps them in listener threads, validates handshakes, sends messages, and segments binary file objects into sequential chunk packets sequentially.</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        {selectedFileIdx === 0 && (
                          <p>The public static entry point <code>Protocol</code> leverages a cached thread pool and safely redirects network listener callbacks to the Android UI main thread using a Handler, fully protecting developers from <code>NetworkOnMainThreadException</code>.</p>
                        )}
                        {selectedFileIdx === 1 && (
                          <p>The <code>Transport</code> interface enforces strict decoupling. It allows swapping the network communication medium completely (e.g. from raw TCP Sockets to WebSockets, Bluetooth RFCOMM, or simulated test streams) without rewriting any packagers or handshakers.</p>
                        )}
                        {selectedFileIdx === 2 && (
                          <p>The <code>TcpTransport</code> provides a production-grade TCP implementation of the transport interface. It encapsulates standard <code>java.net.Socket</code> setup, socket-connect timeouts, and fully buffers incoming and outgoing streams to prevent sub-optimal packet aggregation delays.</p>
                        )}
                        {selectedFileIdx === 3 && (
                          <p>The <code>Connection</code> class starts an autonomous background reader loop to block and parse packets continuously. Outbound writes are fully synchronized via a thread-safe mutex on the <code>PacketWriter</code>, enabling full-duplex communication.</p>
                        )}
                        {selectedFileIdx === 4 && (
                          <p>The <code>Packet</code> is the core immutable unit of protocol transmission. It formats standard 3-byte binary headers (1-byte PacketType + 2-byte payload size) using <code>java.nio.ByteBuffer</code> byte-packing.</p>
                        )}
                        {selectedFileIdx === 5 && (
                          <p>The <code>PacketReader</code> performs precise stream consumption. It reads the first 3 header bytes, unpacks the declared Big-Endian 16-bit short payload length, and loops sequentially until the complete payload is fulfilled.</p>
                        )}
                        {selectedFileIdx === 6 && (
                          <p>The <code>PacketWriter</code> executes thread-safe serialization and flushes bytes directly onto the lower [Transport] stream, fully synchronized to prevent packet corruption during simultaneous background transfers.</p>
                        )}
                        {selectedFileIdx === 7 && (
                          <p>The <code>Field</code> represents a single logical TLV field record. It guarantees the custom protocol marker <code>FIELD_MARKER</code> prefix, 1-byte field key, 2-byte Big-Endian payload length, and raw binary value.</p>
                        )}
                        {selectedFileIdx === 8 && (
                          <p>The <code>FieldWriter</code> adopts a high-speed builder pattern utilizing a <code>ByteArrayOutputStream</code>. It packs primitives (Short, Int, Long, Boolean, String, ByteArray) with strict byte sizing and endianness.</p>
                        )}
                        {selectedFileIdx === 9 && (
                          <p>The <code>FieldReader</code> implements strict, sequential binary decoding of incoming packet payloads. It validates the <code>FIELD_MARKER</code> at the start of every TLV record and throws descriptive <code>IOException</code>s if data integrity is compromised.</p>
                        )}
                        {selectedFileIdx === 10 && (
                          <p>The <code>Dispatcher</code> maps incoming packet type bytes directly to custom <code>PacketHandler</code> closures. This event-driven design allows external modules to register and unregister handlers dynamically for custom extensions.</p>
                        )}
                        {selectedFileIdx === 11 && (
                          <p>The <code>Session</code> serves as the high-level orchestrator. Symmetrically, it negotiates automatic handshakes immediately upon network connection and registers core handlers for heartbeats (PING/PONG), chat, and files.</p>
                        )}
                        {selectedFileIdx === 12 && (
                          <p>The <code>TransferManager</code> slices outgoing files into chunk packets and tracks stats like speed (bytes/sec) and ETA. It supports dynamic mid-stream cancellations, cleanly closing streams and deleting partial temporary files.</p>
                        )}
                        {selectedFileIdx === 13 && (
                          <p>The <code>ProtocolListener</code> uses Kotlin's default interface methods, allowing developers to listen for connections, chats, and chunk transfers without writing redundant boilerplate.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

      </main>

      {/* Elegant Footer */}
      <footer className="border-t border-slate-800 bg-[#161b22]/50 py-5 text-center px-6">
        <p className="text-xs text-slate-500 font-mono">
          Custom Binary TCP Protocol Simulator • Developed in Python & TypeScript • local port syn/ack mapping active
        </p>
      </footer>
    </div>
  );
}
