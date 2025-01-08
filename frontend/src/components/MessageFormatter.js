import React, { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  IconButton,
  Collapse,
  Button,
  Divider
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Launch as LaunchIcon
} from '@mui/icons-material';

const MessageFormatter = ({ content, context, selectedDocs, openPdfPage }) => {
  const [isContextExpanded, setIsContextExpanded] = useState(false);

  const truncateContext = (text, maxLength = 200) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    
    const truncated = text.substring(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf("?"),
      truncated.lastIndexOf("!")
    );
    
    return lastSentenceEnd > 0
      ? text.substring(0, lastSentenceEnd + 1) + "..."
      : text.substring(0, truncated.lastIndexOf(" ")) + "...";
  };

  const formatText = (text) => {
    if (!text) return '';
    
    return text
      .replace(/^(\*{3})/g, '')
      .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
      .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
      .replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
        const level = hashes.length;
        return `<h${level}>${content}</h${level}>`;
      })
      .replace(/(\$?\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|trillion))?)/g, 
        '<span class="numeric-value">$1</span>');
  };

  const formatSection = (section) => {
    if (!section) return null;
    const formattedText = formatText(section);
    
    return (
      <Typography
        component="div"
        dangerouslySetInnerHTML={{ __html: formattedText }}
        sx={{
          '& h1': { fontSize: '1.5rem', fontWeight: 600, my: 2 },
          '& h2': { fontSize: '1.25rem', fontWeight: 600, my: 2 },
          '& h3': { fontSize: '1.1rem', fontWeight: 600, my: 1.5 },
          '& p': { my: 1 },
          '& .numeric-value': {
            fontFamily: 'monospace',
            bgcolor: 'primary.50',
            color: 'primary.main',
            px: 0.5,
            borderRadius: 0.5,
          },
        }}
      />
    );
  };

  const sections = content.split('\n\n').filter(section => section.trim());

  return (
    <Box sx={{ 
      my: 2,
      '& .numeric-value': {
        fontFamily: 'monospace',
        bgcolor: 'rgba(144, 202, 249, 0.1)',
        color: theme => theme.palette.primary.light,
        px: 0.5,
        borderRadius: 0.5,
      }
    }}>
      {sections.map((section, idx) => (
        <Box key={idx} sx={{ mb: 2 }}>
          {formatSection(section)}
        </Box>
      ))}
      
      {context && context.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              mb: 1
            }}
            onClick={() => setIsContextExpanded(!isContextExpanded)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">
                Relevant Source Excerpts
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ({context.length} sources)
              </Typography>
            </Box>
            <IconButton size="small">
              {isContextExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>
          
          <Collapse in={isContextExpanded}>
            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {context.map((ctx, idx) => {
                const relatedDoc = selectedDocs.find(d => d.id === ctx.documentId);
                return (
                  <Card key={idx} variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                            {relatedDoc?.filename || `Document ${ctx.documentId}`}
                          </Typography>
                          <Typography variant="body2">
                            {truncateContext(ctx.content)}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          startIcon={<LaunchIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            openPdfPage(relatedDoc?.file_url, ctx.page_number);
                          }}
                          sx={{ ml: 2 }}
                        >
                          Page {ctx.page_number}
                        </Button>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Collapse>
        </Box>
      )}
    </Box>
  );
};

export default MessageFormatter;