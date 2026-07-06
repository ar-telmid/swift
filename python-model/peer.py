import os
import time
import random
from typing import Optional
from connection import Connection
from packet import Packet
from packet_types import PacketType
from field_writer import FieldWriter
from constants import (
    KEY_DEVICE_NAME,
    KEY_APP_NAME,
    KEY_APP_VERSION,
    KEY_PLATFORM,
    KEY_PROTOCOL_VERSION,
    KEY_TEXT_MESSAGE,
    KEY_SENDER_NAME,
    KEY_TRANSFER_ID,
    KEY_FILE_NAME,
    KEY_FILE_SIZE,
    KEY_CHUNK_SIZE,
    KEY_CHUNK_NUMBER,
    KEY_BINARY_DATA
)

def send_handshake(connection: Connection, node_name: str) -> None:
    """Send protocol handshake symmetrically to identify this node."""
    writer = FieldWriter()
    writer.write_string(KEY_DEVICE_NAME, node_name)
    writer.write_string(KEY_APP_NAME, "CustomBinaryP2PNode")
    writer.write_string(KEY_APP_VERSION, "1.0.0")
    writer.write_string(KEY_PLATFORM, "CrossPlatform/OS")
    writer.write_short(KEY_PROTOCOL_VERSION, 1)

    packet = Packet(PacketType.HANDSHAKE, writer.get_bytes())
    connection.send_packet(packet)
    print(f"[{node_name}] Sent HANDSHAKE identifying as '{node_name}'")

def send_chat(connection: Connection, node_name: str, message: str) -> None:
    """Send a text chat message to the remote peer."""
    writer = FieldWriter()
    writer.write_string(KEY_SENDER_NAME, node_name)
    writer.write_string(KEY_TEXT_MESSAGE, message)

    packet = Packet(PacketType.TEXT, writer.get_bytes())
    connection.send_packet(packet)
    print(f"[{node_name}] Sent chat message: '{message}'")

def send_ping(connection: Connection, node_name: str) -> None:
    """Send a heartbeat PING packet to the remote peer."""
    packet = Packet(PacketType.PING)
    connection.send_packet(packet)
    print(f"[{node_name}] Sent PING heartbeat.")

def send_file(connection: Connection, node_name: str, file_path: str, chunk_size: int = 4096) -> None:
    """
    Symmetrically send a file split into chunks over the custom binary protocol.
    """
    if not os.path.exists(file_path):
        print(f"[{node_name}] Error: Local file not found: {file_path}")
        return

    file_name = os.path.basename(file_path)
    file_size = os.path.getsize(file_path)
    transfer_id = random.randint(1000, 9999)

    print(f"\n[{node_name} File Stream] Initiating file transfer for '{file_name}':")
    print(f"  Transfer ID: {transfer_id}")
    print(f"  Size: {file_size} bytes")
    print(f"  Chunk Size: {chunk_size} bytes")

    # 1. FILE_START packet
    start_writer = FieldWriter()
    start_writer.write_int(KEY_TRANSFER_ID, transfer_id)
    start_writer.write_string(KEY_FILE_NAME, file_name)
    start_writer.write_long(KEY_FILE_SIZE, file_size)
    start_writer.write_int(KEY_CHUNK_SIZE, chunk_size)

    start_packet = Packet(PacketType.FILE_START, start_writer.get_bytes())
    connection.send_packet(start_packet)

    # 2. Read and stream chunks
    chunk_number = 0
    bytes_sent = 0

    with open(file_path, "rb") as f:
        while True:
            data = f.read(chunk_size)
            if not data:
                break

            chunk_number += 1
            chunk_writer = FieldWriter()
            chunk_writer.write_int(KEY_TRANSFER_ID, transfer_id)
            chunk_writer.write_int(KEY_CHUNK_NUMBER, chunk_number)
            chunk_writer.write_bytes(KEY_BINARY_DATA, data)

            chunk_packet = Packet(PacketType.FILE_CHUNK, chunk_writer.get_bytes())
            connection.send_packet(chunk_packet)
            bytes_sent += len(data)

            pct = (bytes_sent / file_size) * 100 if file_size > 0 else 100
            print(f"  [{node_name}] Sent chunk #{chunk_number}: {len(data)} bytes ({pct:.1f}% sent)", end="\r")
            
            # Tiny sleep to avoid packet burst buffer exhaustion
            time.sleep(0.001)

    print() # Finish progress line

    # 3. FILE_END packet
    end_writer = FieldWriter()
    end_writer.write_int(KEY_TRANSFER_ID, transfer_id)

    end_packet = Packet(PacketType.FILE_END, end_writer.get_bytes())
    connection.send_packet(end_packet)
    print(f"[{node_name}] FILE_END packet sent. Complete.")

def run_peer_repl(connection: Connection, node_name: str) -> None:
    """
    Symmetric interactive CLI shell for either peer.
    """
    print(f"\n==============================================")
    print(f"🚀 {node_name} Peer Shell Connected!")
    print(f"Both sides are identical full-duplex peers.")
    print(f"You can send chats, pings, or files at any time.")
    print(f"==============================================")

    # Symmetrically identify ourselves
    try:
        send_handshake(connection, node_name)
    except Exception as e:
        print(f"Failed to send handshake: {e}")

    time.sleep(0.2)

    while connection.is_active:
        try:
            print("\nOptions:")
            print("1. Send Chat Message")
            print("2. Send File")
            print("3. Send Heartbeat PING")
            print("4. Close / Disconnect")
            
            choice = input("\nEnter choice (1-4): ").strip()
            if not connection.is_active:
                break

            if choice == "1":
                msg = input("Enter message: ").strip()
                if msg:
                    send_chat(connection, node_name, msg)
            elif choice == "2":
                path = input("Enter local file path to send: ").strip()
                if path:
                    send_file(connection, node_name, path)
            elif choice == "3":
                send_ping(connection, node_name)
            elif choice == "4":
                print("Disconnecting gracefully...")
                try:
                    connection.send_packet(Packet(PacketType.DISCONNECT))
                except Exception:
                    pass
                connection.close()
                break
            else:
                print("Invalid option. Please enter 1-4.")
        except KeyboardInterrupt:
            print("\nExiting peer shell...")
            try:
                connection.send_packet(Packet(PacketType.DISCONNECT))
            except Exception:
                pass
            connection.close()
            break
        except Exception as e:
            print(f"Error in peer shell: {e}")
            break

    print(f"🏁 {node_name} Peer Shell closed.")
