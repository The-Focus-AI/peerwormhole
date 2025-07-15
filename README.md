# NodePeer Examples

A collection of peer-to-peer applications demonstrating the capabilities of NodePeer, built with PeerJS for both Node.js and web environments.

## Docker build

docker buildx build --platform linux/x86_64 -t node-peerjs -f Dockerfile .


## Features

### File Transfer
- Send files between peers with progress reporting
- Support for both file and stdin data transfer
- Chunked transfer for large files
- Real-time progress updates
- Clean connection handling and error recovery

### Chat Application (Node.js)
- Real-time peer-to-peer messaging
- Support for multiple connected peers
- Username-based message identification
- System messages for peer events
- Clean command-line interface
- Proper connection management

### Web Chat Client
- Modern, responsive interface built with TailwindCSS
- Real-time messaging with PeerJS
- Seamless integration with Node.js chat
- Connection status indicators
- Local message display
- System messages and error handling

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- Modern web browser (for web client)
- Internet connection for peer discovery

### Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd nodepeer-examples
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

### File Transfer

1. Start receiver:
   ```bash
   node src-js/examples/file-transfer.js receive <peer-id>
   ```

2. Send a file:
   ```bash
   node src-js/examples/file-transfer.js send <file-path>
   ```

3. Send from stdin:
   ```bash
   echo "Hello World" | node src-js/examples/file-transfer.js send
   ```

### Chat Application

1. Start as standalone:
   ```bash
   node src-js/examples/chat.js
   ```

2. Connect to a peer:
   ```bash
   node src-js/examples/chat.js <peer-id>
   ```

Commands:
- Type messages and press Enter to send
- Type `/quit` to exit
- Use Ctrl+C for clean exit

### Web Chat Client

1. Open `src-js/examples/chat.html` in a web browser
2. Enter your username when prompted
3. To connect to a peer:
   - Copy the peer ID from another chat instance
   - Paste it into the "Enter peer ID to connect" field
   - Click "Connect"
4. Start chatting!

## Architecture

### File Transfer
- Chunked data transfer for efficiency
- Progress tracking and reporting
- Error handling and recovery
- Clean connection management

### Chat Implementation
- Broadcast messaging system
- Connection state tracking
- Event-based message handling
- Clean exit and resource cleanup

### Web Client
- Single-page application design
- Real-time PeerJS integration
- Modern UI with TailwindCSS
- Cross-platform compatibility

## Development

### Project Structure
```
src-js/
  examples/
    chat.js         # Node.js chat implementation
    chat.html       # Web chat client
    file-transfer.js # File transfer implementation
```

### Key Components
- `NodePeer`: Core peer-to-peer functionality
- `ChatApp`: Chat application logic
- Web Client: Browser-based chat interface

## Future Enhancements

### Chat Features
- Private messaging
- Chat rooms/groups
- Message history
- File sharing
- Message encryption
- User presence
- Emoji and rich text support
- Typing indicators
- Read receipts

### File Transfer Features
- Compression support
- Multiple file transfers
- Resume capability
- File integrity checks

## Contributing
Contributions are welcome! Please feel free to submit pull requests.

## License
This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments
- PeerJS for peer-to-peer connectivity
- TailwindCSS for modern UI design 