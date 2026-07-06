// Custom Binary TCP Protocol TypeScript Simulation Engine
// Replicates the byte-packing and byte-unpacking of the Python protocol

export enum PacketType {
  HANDSHAKE = 0x01,
  HANDSHAKE_ACK = 0x02,
  TEXT = 0x03,
  FILE_START = 0x04,
  FILE_CHUNK = 0x05,
  FILE_END = 0x06,
  PING = 0x07,
  PONG = 0x08,
  DISCONNECT = 0x09,
}

export const PacketTypeNames: Record<PacketType, string> = {
  [PacketType.HANDSHAKE]: "HANDSHAKE",
  [PacketType.HANDSHAKE_ACK]: "HANDSHAKE_ACK",
  [PacketType.TEXT]: "TEXT",
  [PacketType.FILE_START]: "FILE_START",
  [PacketType.FILE_CHUNK]: "FILE_CHUNK",
  [PacketType.FILE_END]: "FILE_END",
  [PacketType.PING]: "PING",
  [PacketType.PONG]: "PONG",
  [PacketType.DISCONNECT]: "DISCONNECT",
};

// Keys matching constants.py
export const KEY_DEVICE_NAME = 0x01;
export const KEY_APP_NAME = 0x02;
export const KEY_APP_VERSION = 0x03;
export const KEY_PLATFORM = 0x04;
export const KEY_PROTOCOL_VERSION = 0x05;

export const KEY_TRANSFER_ID = 0x0a;
export const KEY_FILE_NAME = 0x0b;
export const KEY_FILE_SIZE = 0x0c;
export const KEY_CHUNK_SIZE = 0x0d;
export const KEY_CHUNK_NUMBER = 0x0e;
export const KEY_BINARY_DATA = 0x0f;

export const KEY_TEXT_MESSAGE = 0x14;
export const KEY_SENDER_NAME = 0x15;

export const FieldKeyNames: Record<number, string> = {
  [KEY_DEVICE_NAME]: "Device Name / Success Status",
  [KEY_APP_NAME]: "Application Name / Status Message",
  [KEY_APP_VERSION]: "Application Version",
  [KEY_PLATFORM]: "Platform",
  [KEY_PROTOCOL_VERSION]: "Protocol Version",
  [KEY_TRANSFER_ID]: "Transfer ID",
  [KEY_FILE_NAME]: "File Name",
  [KEY_FILE_SIZE]: "File Size",
  [KEY_CHUNK_SIZE]: "Chunk Size",
  [KEY_CHUNK_NUMBER]: "Chunk Number",
  [KEY_BINARY_DATA]: "Binary Data",
  [KEY_TEXT_MESSAGE]: "Text Message",
  [KEY_SENDER_NAME]: "Sender Name",
};

export interface ByteSegment {
  index: number;
  value: number;
  hex: string;
  char: string;
  role: "header-type" | "header-length" | "field-marker" | "field-key" | "field-length" | "field-value";
  meta: string; // Describes the purpose of this byte
}

export interface ParsedField {
  key: number;
  keyName: string;
  length: number;
  rawBytes: Uint8Array;
  decodedValue: string | number | boolean;
  type: "string" | "short" | "int" | "long" | "boolean" | "bytes";
}

export interface SerializedPacketResult {
  packetType: PacketType;
  typeName: string;
  payloadLength: number;
  totalLength: number;
  rawBytes: Uint8Array;
  segments: ByteSegment[];
  fields: ParsedField[];
}

// Helpers to write binary fields
export class SimFieldWriter {
  private buffer: number[] = [];

  private writeFieldHeader(key: number, length: number) {
    this.buffer.push(0x00); // Marker (1 byte)
    this.buffer.push(key);  // Key (1 byte)
    this.buffer.push((length >> 8) & 0xff); // Length high byte
    this.buffer.push(length & 0xff);        // Length low byte
  }

  writeString(key: number, value: string): void {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(value);
    this.writeFieldHeader(key, encoded.length);
    for (let i = 0; i < encoded.length; i++) {
      this.buffer.push(encoded[i]);
    }
  }

  writeShort(key: number, value: number): void {
    this.writeFieldHeader(key, 2);
    this.buffer.push((value >> 8) & 0xff);
    this.buffer.push(value & 0xff);
  }

  writeInt(key: number, value: number): void {
    this.writeFieldHeader(key, 4);
    this.buffer.push((value >> 24) & 0xff);
    this.buffer.push((value >> 16) & 0xff);
    this.buffer.push((value >> 8) & 0xff);
    this.buffer.push(value & 0xff);
  }

  writeLong(key: number, value: number): void {
    this.writeFieldHeader(key, 8);
    // Write 64-bit big-endian integer
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setBigInt64(0, BigInt(value), false);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < 8; i++) {
      this.buffer.push(bytes[i]);
    }
  }

  writeBoolean(key: number, value: boolean): void {
    this.writeFieldHeader(key, 1);
    this.buffer.push(value ? 1 : 0);
  }

  writeBytes(key: number, value: Uint8Array): void {
    this.writeFieldHeader(key, value.length);
    for (let i = 0; i < value.length; i++) {
      this.buffer.push(value[i]);
    }
  }

  getPayloadBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// Construct full packet
export function buildPacket(packetType: PacketType, payload: Uint8Array): SerializedPacketResult {
  const payloadLength = payload.length;
  const totalLength = 3 + payloadLength;
  const rawBytes = new Uint8Array(totalLength);

  // 1. Fixed Header
  rawBytes[0] = packetType;
  rawBytes[1] = (payloadLength >> 8) & 0xff;
  rawBytes[2] = payloadLength & 0xff;

  // 2. Payload
  rawBytes.set(payload, 3);

  // 3. Segment analysis for visualization
  const segments: ByteSegment[] = [];
  
  // Type segment
  segments.push({
    index: 0,
    value: packetType,
    hex: toHex(packetType),
    char: toChar(packetType),
    role: "header-type",
    meta: `Header: Packet Type = ${PacketTypeNames[packetType]} (${packetType})`,
  });

  // Length segments
  const lenHigh = rawBytes[1];
  const lenLow = rawBytes[2];
  segments.push({
    index: 1,
    value: lenHigh,
    hex: toHex(lenHigh),
    char: toChar(lenHigh),
    role: "header-length",
    meta: `Header: Payload Length MSB = ${lenHigh}`,
  });
  segments.push({
    index: 2,
    value: lenLow,
    hex: toHex(lenLow),
    char: toChar(lenLow),
    role: "header-length",
    meta: `Header: Payload Length LSB = ${lenLow}. Total payload is ${payloadLength} bytes.`,
  });

  // Fields tracking
  const fields: ParsedField[] = [];
  let offset = 3;

  while (offset < totalLength) {
    if (totalLength - offset < 4) {
      // truncated
      break;
    }

    const fieldStartIndex = offset;
    const marker = rawBytes[offset];
    const key = rawBytes[offset + 1];
    const length = (rawBytes[offset + 2] << 8) | rawBytes[offset + 3];

    segments.push({
      index: offset,
      value: marker,
      hex: toHex(marker),
      char: toChar(marker),
      role: "field-marker",
      meta: `Field Marker: ${marker === 0x00 ? "Valid (0x00)" : "INVALID"}`,
    });

    const keyName = FieldKeyNames[key] || `Custom Key (${key})`;
    segments.push({
      index: offset + 1,
      value: key,
      hex: toHex(key),
      char: toChar(key),
      role: "field-key",
      meta: `Field Key: ${keyName} (${toHex(key)})`,
    });

    segments.push({
      index: offset + 2,
      value: rawBytes[offset + 2],
      hex: toHex(rawBytes[offset + 2]),
      char: toChar(rawBytes[offset + 2]),
      role: "field-length",
      meta: `Field Length MSB = ${rawBytes[offset + 2]}`,
    });

    segments.push({
      index: offset + 3,
      value: rawBytes[offset + 3],
      hex: toHex(rawBytes[offset + 3]),
      char: toChar(rawBytes[offset + 3]),
      role: "field-length",
      meta: `Field Length LSB = ${rawBytes[offset + 3]}. Field Value is ${length} bytes.`,
    });

    offset += 4;

    const valueBytes = rawBytes.slice(offset, offset + length);
    
    // Guess field data type based on Key, and decode
    let decodedValue: string | number | boolean = "";
    let type: "string" | "short" | "int" | "long" | "boolean" | "bytes" = "bytes";

    if (key === KEY_PROTOCOL_VERSION) {
      type = "short";
      const view = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.byteLength);
      decodedValue = valueBytes.length >= 2 ? view.getInt16(0, false) : 0;
    } else if (key === KEY_TRANSFER_ID || key === KEY_CHUNK_SIZE || key === KEY_CHUNK_NUMBER) {
      type = "int";
      const view = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.byteLength);
      decodedValue = valueBytes.length >= 4 ? view.getInt32(0, false) : 0;
    } else if (key === KEY_FILE_SIZE) {
      type = "long";
      const view = new DataView(valueBytes.buffer, valueBytes.byteOffset, valueBytes.byteLength);
      decodedValue = valueBytes.length >= 8 ? Number(view.getBigInt64(0, false)) : 0;
    } else if (key === 0x01 && packetType === PacketType.HANDSHAKE_ACK) {
      // Handshake ack success boolean
      type = "boolean";
      decodedValue = valueBytes[0] !== 0;
    } else if (key === KEY_BINARY_DATA) {
      type = "bytes";
      decodedValue = `[Raw Binary: ${length} bytes]`;
    } else {
      // Default to string
      type = "string";
      decodedValue = new TextDecoder().decode(valueBytes);
    }

    fields.push({
      key,
      keyName,
      length,
      rawBytes: valueBytes,
      decodedValue,
      type,
    });

    for (let i = 0; i < length; i++) {
      const b = valueBytes[i];
      segments.push({
        index: offset + i,
        value: b,
        hex: toHex(b),
        char: toChar(b),
        role: "field-value",
        meta: `Field '${keyName}' Value Byte ${i + 1}/${length}: ${toHex(b)} ('${toChar(b)}')`,
      });
    }

    offset += length;
  }

  return {
    packetType,
    typeName: PacketTypeNames[packetType],
    payloadLength,
    totalLength,
    rawBytes,
    segments,
    fields,
  };
}

function toHex(val: number): string {
  return val.toString(16).toUpperCase().padStart(2, "0");
}

function toChar(val: number): string {
  if (val >= 32 && val <= 126) {
    return String.fromCharCode(val);
  }
  return ".";
}

// Generate default mock packets
export function generateDemoPacket(packetType: PacketType): SerializedPacketResult {
  const writer = new SimFieldWriter();

  switch (packetType) {
    case PacketType.HANDSHAKE:
      writer.writeString(KEY_DEVICE_NAME, "Workstation-Alpha");
      writer.writeString(KEY_APP_NAME, "HighSpeedFileDaemon");
      writer.writeString(KEY_APP_VERSION, "2.4.1");
      writer.writeString(KEY_PLATFORM, "macOS-AppleSilicon");
      writer.writeShort(KEY_PROTOCOL_VERSION, 1);
      break;

    case PacketType.HANDSHAKE_ACK:
      writer.writeBoolean(0x01, true); // Success
      writer.writeString(0x02, "Handshake verified. Node authorized.");
      break;

    case PacketType.TEXT:
      writer.writeString(KEY_SENDER_NAME, "Alice");
      writer.writeString(KEY_TEXT_MESSAGE, "Hello network! Protocol built successfully.");
      break;

    case PacketType.FILE_START:
      writer.writeInt(KEY_TRANSFER_ID, 101);
      writer.writeString(KEY_FILE_NAME, "project_report.pdf");
      writer.writeLong(KEY_FILE_SIZE, 1048576); // 1 MB
      writer.writeInt(KEY_CHUNK_SIZE, 16384);   // 16 KB
      break;

    case PacketType.FILE_CHUNK:
      writer.writeInt(KEY_TRANSFER_ID, 101);
      writer.writeInt(KEY_CHUNK_NUMBER, 12);
      // Let's write some dummy sample binary bytes: 'PDF-1.4 header bytes'
      const dummyBytes = new TextEncoder().encode("%PDF-1.4 %binary chunk data...");
      writer.writeBytes(KEY_BINARY_DATA, dummyBytes);
      break;

    case PacketType.FILE_END:
      writer.writeInt(KEY_TRANSFER_ID, 101);
      break;

    case PacketType.PING:
    case PacketType.PONG:
    case PacketType.DISCONNECT:
    default:
      // No fields, empty payload
      break;
  }

  return buildPacket(packetType, writer.getPayloadBytes());
}
