// ChatHistory.js
import React from 'react';
import { FaComments } from 'react-icons/fa';

const ChatHistory = ({ chats, onChatSelect, selectedChatId }) => {
  return (
    <div className="chat-history p-3">
      <h6 className="mb-3 text-muted">Chat History</h6>
      <div className="chat-list">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className={`chat-item p-3 mb-2 rounded cursor-pointer ${
              selectedChatId === chat.id ? 'selected' : ''
            }`}
            onClick={() => onChatSelect(chat)}
          >
            <div className="d-flex align-items-center gap-2">
              <FaComments className="text-primary" />
              <div className="chat-preview">
                <div className="chat-title text-truncate">{chat.title || chat.first_query}</div>
                <small className="text-muted">
                  {new Date(chat.created_at).toLocaleDateString()}
                </small>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ChatHistory;