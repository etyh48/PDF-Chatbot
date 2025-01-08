// src/components/PDFViewer.js
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs"; 

const PDFViewer = ({ url, pageNumber, onClose }) => {
    const [error, setError] = useState(null);
    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);
  
    useEffect(() => {
      const loadPDF = async () => {
        try {
          // Cancel any existing render task
          if (renderTaskRef.current) {
            renderTaskRef.current.cancel();
            renderTaskRef.current = null;
          }
  
          // Clear the canvas
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          context.clearRect(0, 0, canvas.width, canvas.height);
  
          // Load the PDF
          const loadingTask = pdfjsLib.getDocument(url);
          const pdf = await loadingTask.promise;
  
          // Validate page number
          const validPageNumber = Math.min(Math.max(1, pageNumber), pdf.numPages);
          const page = await pdf.getPage(validPageNumber);
          
          const viewport = page.getViewport({ scale: 1.5 });
          canvas.height = viewport.height;
          canvas.width = viewport.width;
  
          // Store the render task
          renderTaskRef.current = page.render({
            canvasContext: context,
            viewport: viewport
          });
  
          await renderTaskRef.current.promise;
        } catch (err) {
          if (err.name !== 'RenderingCancelled') {
            console.error('Error loading PDF:', err);
            setError('Error loading PDF page');
          }
        }
      };
  
      loadPDF();
  
      // Cleanup function
      return () => {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
      };
    }, [url, pageNumber]);
  
    return (
      <div className="pdf-viewer-overlay">
        <div className="pdf-viewer-content">
          <button className="close-button" onClick={onClose}>×</button>
          {error ? (
            <div className="error-message">{error}</div>
          ) : (
            <canvas ref={canvasRef}></canvas>
          )}
        </div>
      </div>
    );
  };
  
  export default PDFViewer;