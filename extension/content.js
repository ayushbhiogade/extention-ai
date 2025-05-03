// content.js

/**
 * SimpleContentExtractor - A lightweight content extractor for Chrome extensions
 * Implemented directly in the content script
 */
class SimpleContentExtractor {
  constructor(document) {
    this.document = document;
  }

  /**
   * Main method to parse the document and extract the main content
   * @returns {Object} Object containing title, excerpt, and textContent
   */
  parse() {
    try {
      // Get the page title
      const title = this.getArticleTitle();
      
      // Try to find the main content
      const mainContent = this.findMainContent();
      
      if (!mainContent) {
        console.warn("Could not find main content");
        return {
          title: title,
          excerpt: "",
          textContent: this.document.body.innerText
        };
      }
      
      // Extract text and create a short excerpt
      const textContent = mainContent.innerText || "";
      const excerpt = this.getExcerpt(textContent);
      
      return {
        title: title,
        excerpt: excerpt,
        textContent: textContent
      };
    } catch (error) {
      console.error("Content extraction error:", error);
      // Fallback to body text
      return {
        title: this.document.title || "",
        excerpt: "",
        textContent: this.document.body.innerText || ""
      };
    }
  }

  /**
   * Get the article title from the document
   */
  getArticleTitle() {
    // First try to get the main heading
    const h1 = this.document.querySelector('h1');
    if (h1 && h1.textContent.length > 0) {
      return h1.textContent.trim();
    }
    
    // Fallback to document title
    return this.document.title || "";
  }

  /**
   * Find the main content of the page
   */
  findMainContent() {
    // Try to find the main content using common selectors
    const contentSelectors = [
      'article',
      '[role="main"]',
      'main',
      '.main-content',
      '.post-content',
      '.article-content',
      '.content',
      '#content',
      '.entry-content',
      '.post',
      '.article'
    ];
    
    // Try each selector
    for (const selector of contentSelectors) {
      const element = this.document.querySelector(selector);
      if (element && this.hasSubstantialContent(element)) {
        return element;
      }
    }
    
    // If no content found with selectors, try to find the element with the most paragraph content
    return this.findElementWithMostParagraphs(this.document.body);
  }

  /**
   * Check if an element has substantial content
   */
  hasSubstantialContent(element) {
    const text = element.innerText || "";
    return text.length > 250; // Arbitrary threshold
  }

  /**
   * Find the element with the most paragraphs
   */
  findElementWithMostParagraphs(rootElement) {
    const paragraphs = rootElement.querySelectorAll('p');
    if (paragraphs.length === 0) {
      return rootElement; // No paragraphs, return the root element
    }
    
    // Count paragraphs in each parent element
    const parentCounts = new Map();
    
    paragraphs.forEach(p => {
      // Skip very short paragraphs
      if (p.innerText.length < 20) return;
      
      // Find parents up to 3 levels
      let parent = p.parentElement;
      for (let i = 0; i < 3 && parent; i++) {
        const count = parentCounts.get(parent) || 0;
        parentCounts.set(parent, count + 1);
        parent = parent.parentElement;
      }
    });
    
    // Find the element with the most paragraphs
    let bestParent = rootElement;
    let maxParagraphs = 0;
    
    parentCounts.forEach((count, parent) => {
      if (count > maxParagraphs) {
        maxParagraphs = count;
        bestParent = parent;
      }
    });
    
    return bestParent;
  }

  /**
   * Create a short excerpt from the text content
   */
  getExcerpt(textContent, maxLength = 150) {
    if (!textContent || textContent.length === 0) {
      return "";
    }
    
    // Get the first few sentences
    const text = textContent.trim().substring(0, 500);
    const sentences = text.split(/[.!?]+/);
    
    let excerpt = "";
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length === 0) continue;
      
      if (excerpt.length + trimmedSentence.length + 1 <= maxLength) {
        excerpt += (excerpt ? ". " : "") + trimmedSentence;
      } else {
        break;
      }
    }
    
    return excerpt + (excerpt.length < textContent.length ? "..." : "");
  }
}

// Test function to check if content extraction is working
function testContentExtraction() {
  try {
    console.log("Testing content extraction...");
    const extractor = new SimpleContentExtractor(document);
    const article = extractor.parse();
    
    if (article && article.textContent) {
      console.log("✅ Content extraction SUCCESS!");
      console.log("Title:", article.title);
      console.log("Excerpt:", article.excerpt);
      console.log("Content length:", article.textContent.length);
      console.log("First 150 chars:", article.textContent.substring(0, 150) + "...");
      return true;
    } else {
      console.log("❌ Content extraction FAILED: Could not parse article");
      return false;
    }
  } catch (error) {
    console.error("❌ Content extraction ERROR:", error);
    return false;
  }
}

// Run test on page load
setTimeout(testContentExtraction, 1000);

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageContent') {
        console.log('Content script received request for page content.');
        
        try {
            /* Use our content extractor to get the main content */
            const extractor = new SimpleContentExtractor(document);
            const article = extractor.parse();

            if (article && article.textContent) {
                console.log('Extracted text length:', article.textContent.length);
                sendResponse({ success: true, content: article.textContent });
            } else {
                console.warn('Could not parse the article. Falling back to body text.');
                // Fallback to basic text extraction
                const bodyText = document.body.innerText || '';
                sendResponse({ success: true, content: bodyText });
            }
        } catch (error) {
            console.error('Error using Readability or extracting page content:', error);
            // Attempt fallback even on error
            try {
                 const bodyText = document.body.innerText || '';
                 console.warn('Sending fallback body text due to Readability error.');
                 sendResponse({ success: true, content: bodyText });
            } catch (fallbackError) {
                 console.error('Error during fallback text extraction:', fallbackError);
                 sendResponse({ success: false, error: `Readability Error: ${error.message}; Fallback Error: ${fallbackError.message}` });
            }
        }
        return true; // Indicates response will be sent asynchronously
    }
});

console.log('AI Q&A content script loaded (with content extraction).');
