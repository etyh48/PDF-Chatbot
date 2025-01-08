import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist';
import { getDocument } from 'pdfjs-dist';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Button,
  TextField,
  Paper,
  IconButton,
  Chip,
  CircularProgress,
  Container,
  Card,
  CardContent,
  LinearProgress,
  useTheme
} from '@mui/material';
import {
  AddCircleOutline,
  Delete,
  Send,
  UploadFile,
  Description,
  Chat as ChatIcon,
  ExpandMore,
  ExpandLess,
  Launch
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import MessageFormatter from './components/MessageFormatter';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs';

const drawerWidth = 320;

// Create dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
  components: {
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1e1e1e',
          borderRight: '1px solid rgba(255, 255, 255, 0.12)',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            backgroundColor: 'rgba(144, 202, 249, 0.16)',
            '&:hover': {
              backgroundColor: 'rgba(144, 202, 249, 0.24)',
            },
          },
        },
      },
    },
  },
});

// Styled components
const StyledDrawer = styled(Drawer)(({ theme }) => ({
  width: drawerWidth,
  flexShrink: 0,
  '& .MuiDrawer-paper': {
    width: drawerWidth,
    boxSizing: 'border-box',
    position: 'relative',
    height: '100vh'
  },
}));

const Main = styled('main')(({ theme }) => ({
  flexGrow: 1,
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  padding: 0,
  margin: 0,
  overflow: 'hidden'
}));

const ChatContainer = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  overflowY: 'auto',
  padding: theme.spacing(2),
  marginBottom: theme.spacing(2),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2)
}));

const InputContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.paper,
  borderTop: `1px solid ${theme.palette.divider}`,
}));

const MessageBubble = styled(Paper)(({ theme, variant }) => ({
  padding: theme.spacing(2),
  maxWidth: '70%',
  marginBottom: theme.spacing(2),
  backgroundColor: variant === 'user' 
    ? theme.palette.primary.dark
    : theme.palette.background.paper,
  color: variant === 'user' 
    ? theme.palette.primary.contrastText 
    : theme.palette.text.primary,
  alignSelf: variant === 'user' ? 'flex-end' : 'flex-start',
  borderRadius: theme.spacing(2),
  border: `1px solid ${theme.palette.divider}`,
}));

const FileInput = styled('input')({
  display: 'none',
});

function App() {
  const theme = useTheme();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [currentChatId, setCurrentChatId] = useState(null);
  const [allChats, setAllChats] = useState([]);
  const latestMessageRef = useRef(null);

  // Supabase client setup
  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_ANON_KEY
  );

  // File handling functions
  const handleFileChange = (event) => {
    const files = Array.from(event.target.files).filter(file => {
      const isValidType = file.type === 'application/pdf';
      const isValidSize = file.size <= 10 * 1024 * 1024;
      
      if (!isValidType) alert(`${file.name} is not a PDF file`);
      if (!isValidSize) alert(`${file.name} exceeds 10MB size limit`);
      
      return isValidType && isValidSize;
    });
    
    setSelectedFiles(files);
  };

  // Document selection handler
  const handleDocumentSelect = (doc) => {
    setSelectedDocs(prev => {
      const isSelected = prev.some(d => d.id === doc.id);
      return isSelected ? prev.filter(d => d.id !== doc.id) : [...prev, doc];
    });
  };

  // Chat message rendering
  const renderMessage = (message, index) => (
    <Box
      key={index}
      ref={index === chatHistory.length - 1 ? latestMessageRef : null}
      display="flex"
      flexDirection="column"
      gap={2}
    >
      <MessageBubble variant="user" elevation={1}>
        <Typography>{message.query}</Typography>
      </MessageBubble>

      <Box className="message ai-message align-self-start">
        <div className="p-3 rounded-3 outer">
          <MessageFormatter 
            content={message.response}
            context={message.context}
            selectedDocs={selectedDocs}
            openPdfPage={openPdfPage}
          />
        </div>
      </Box>
    </Box>
  );

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      await Promise.all([fetchDocuments(), fetchChats()]);
    };
    fetchInitialData();
  }, []);

  // Scroll to latest message
  useEffect(() => {
    if (latestMessageRef.current) {
      latestMessageRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory]);

  // Fetch documents
  const fetchDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
    }
  };

  // Fetch all chats
  const fetchChats = async () => {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAllChats(data || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!selectedFiles.length) return;

    setLoading(true);
    try {
      for (const file of selectedFiles) {
        setUploadProgress((prev) => ({ ...prev, [file.name]: 0 }));

        // Upload to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("pdfs")
          .upload(`${Date.now()}_${file.name}`, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("pdfs")
          .getPublicUrl(uploadData.path);

        // Process PDF content
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;

        // Create document record
        const { data: docData, error: docError } = await supabase
          .from("documents")
          .insert({
            filename: file.name,
            file_url: publicUrl,
            total_pages: totalPages,
          })
          .select()
          .single();

        if (docError) throw docError;

        let fullText = [];
        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");

          fullText.push({
            text: pageText,
            pageNumber: i,
          });

          setUploadProgress((prev) => ({
            ...prev,
            [file.name]: (i / totalPages) * 100,
          }));
        }

        // Process with edge function
        const response = await fetch(
          `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/process-pdf`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              documentId: docData.id,
              pages: fullText,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to process ${file.name}: ${errorText}`);
        }
      }

      setSelectedFiles([]);
      setUploadProgress({});
      fetchDocuments();
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error uploading files: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle document deletion
  const handleDelete = async (doc) => {
    try {
      const filename = doc.file_url.split("/").pop();
      const { error: storageError } = await supabase.storage
        .from("pdfs")
        .remove([filename]);

      if (storageError) throw storageError;

      const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);

      if (deleteError) throw deleteError;

      fetchDocuments();
    } catch (error) {
      console.error("Delete error:", error);
      alert("Error deleting document");
    }
  };

  // Handle query submission
  const handleQuerySubmit = async () => {
    if (!query?.trim()) {
      alert('Please enter a query');
      return;
    }

    if (!currentChatId && !selectedDocs?.length) {
      alert('Please select at least one document to start a chat');
      return;
    }

    setLoading(true);
    try {
      let chatId = currentChatId;
      let documentIds = selectedDocs.map(doc => doc.id);

      if (!chatId) {
        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({
            title: query.trim(),
            document_ids: documentIds
          })
          .select()
          .single();

        if (chatError) throw chatError;

        chatId = newChat.id;
        setCurrentChatId(chatId);
      }

      const response = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/process-query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            query: query.trim(),
            documentIds
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const result = await response.json();

      const { error: messageError } = await supabase
        .from("chat_messages")
        .insert({
          chat_id: chatId,
          query: query.trim(),
          response: result.answer,
          context: result.context || null,
          document_ids: documentIds,
          type: 'conversation'
        });

      if (messageError) throw messageError;

      fetchChatMessages(chatId);
      setQuery("");
    } catch (error) {
      console.error("Query error:", error);
      alert("Error processing query: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch chat messages
  const fetchChatMessages = async (chatId) => {
    if (!chatId) return;
    
    setLoading(true);
    try {
      const { data: chatData, error: chatError } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .single();

      if (chatError) throw chatError;

      if (chatData.document_ids?.length > 0) {
        const { data: docsData, error: docsError } = await supabase
          .from("documents")
          .select("*")
          .in("id", chatData.document_ids);

        if (docsError) throw docsError;
        setSelectedDocs(docsData || []);
      }

      const { data: messages, error: messagesError } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (messagesError) throw messagesError;
      setChatHistory(messages || []);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      setChatHistory([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle new chat creation
  const handleNewChat = () => {
    setCurrentChatId(null);
    setSelectedDocs([]);
    setChatHistory([]);
    setQuery('');
  };

  // Open PDF viewer
  const openPdfPage = async (url, pageNumber) => {
    try {
      const { data: signedUrlData, error } = await supabase.storage
        .from("pdfs")
        .createSignedUrl(url.split("/").pop(), 3600);

      if (error) throw error;

      if (signedUrlData?.signedUrl) {
        const page = parseInt(pageNumber, 10) || 1;
        const viewerUrl = `/pdfjs/viewer.html?file=${encodeURIComponent(
          signedUrlData.signedUrl
        )}&page=${page}`;
        window.open(viewerUrl, "_blank");
      }
    } catch (error) {
      console.error("Error opening PDF:", error);
      alert("Error opening PDF");
    }
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', width: '100%', bgcolor: 'background.default' }}>
      <StyledDrawer
        variant="permanent"
        sx={{
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            position: 'relative',
            height: '100vh'
          }
        }}
      >
        <Toolbar>
          <Typography variant="h6" noWrap>
            PDF Chat Assistant
          </Typography>
        </Toolbar>
        <Divider />
        
        {/* File Upload Section */}
        <Box p={2}>
          <label htmlFor="file-input">
            <FileInput
              id="file-input"
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileChange}
              disabled={loading}
            />
            <Button
              variant="outlined"
              component="span"
              startIcon={<UploadFile />}
              fullWidth
              sx={{ mb: 2 }}
            >
              Choose Files
            </Button>
          </label>
          
          <Button
            variant="contained"
            fullWidth
            disabled={!selectedFiles.length || loading}
            onClick={handleUpload}
          >
            Upload {selectedFiles.length ? `(${selectedFiles.length})` : ''}
          </Button>
        </Box>
        
        <Divider />

        {/* Chat History */}
        <List sx={{ py: 2 }}>
          <ListItem>
            <Button
              fullWidth
              variant="contained"
              startIcon={<AddCircleOutline />}
              onClick={handleNewChat}
            >
              New Chat
            </Button>
          </ListItem>
          
          {allChats.map((chat) => (
            <ListItem
              key={chat.id}
              button
              selected={currentChatId === chat.id}
              onClick={() => {
                setCurrentChatId(chat.id);
                fetchChatMessages(chat.id);
              }}
              sx={{
                mt: 1,
                borderRadius: 1,
                '&.Mui-selected': {
                  backgroundColor: 'primary.light',
                  '&:hover': {
                    backgroundColor: 'primary.light',
                  },
                },
              }}
            >
              <ListItemIcon>
                <ChatIcon color={currentChatId === chat.id ? 'primary' : 'inherit'} />
              </ListItemIcon>
              <ListItemText
                primary={chat.title || `Chat ${chat.id}`}
                secondary={new Date(chat.created_at).toLocaleDateString()}
                primaryTypographyProps={{
                  noWrap: true,
                  fontWeight: currentChatId === chat.id ? 500 : 400,
                }}
              />
            </ListItem>
          ))}
        </List>

        <Divider />
        
        {/* Documents List */}
        <List>
          {documents.map((doc) => (
            <ListItem
              key={doc.id}
              button
              selected={selectedDocs.some(d => d.id === doc.id)}
              onClick={() => handleDocumentSelect(doc)}
            >
              <ListItemIcon>
                <Description color={selectedDocs.some(d => d.id === doc.id) ? 'primary' : 'inherit'} />
              </ListItemIcon>
              <ListItemText 
                primary={doc.filename}
                primaryTypographyProps={{ noWrap: true }}
              />
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(doc);
                }}
              >
                <Delete fontSize="small" />
              </IconButton>
            </ListItem>
          ))}
        </List>
      </StyledDrawer>

      <Main>
        {/* Chat Header */}
        <Paper elevation={0} sx={{ mb: 2, p: 2 }}>
          <Typography variant="h6">
            {currentChatId ? 'Current Chat' : 'New Chat'}
          </Typography>
          <Box display="flex" gap={1} mt={1}>
            {selectedDocs.map(doc => (
              <Chip
                key={doc.id}
                label={doc.filename}
                onDelete={() => handleDocumentSelect(doc)}
                size="small"
              />
            ))}
          </Box>
        </Paper>

        {/* Chat Messages */}
        <ChatContainer>
          {loading && <LinearProgress />}
          {chatHistory.map((message, index) => renderMessage(message, index))}
        </ChatContainer>

        {/* Input Area */}
        <InputContainer>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleQuerySubmit();
            }} 
            className="d-flex gap-3"
          >
            <TextField
              fullWidth
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                selectedDocs.length > 0
                  ? "Ask a question about the selected documents..."
                  : "Select at least one document first"
              }
              disabled={selectedDocs.length === 0 || loading}
              sx={{ mr: 2 }}
            />
            <Button
              type="submit"
              variant="contained"
              endIcon={<Send />}
              disabled={selectedDocs.length === 0 || loading || !query.trim()}
            >
              Send
            </Button>
          </form>
        </InputContainer>
      </Main>
    </Box>
    </ThemeProvider>
  );
}


export default App;