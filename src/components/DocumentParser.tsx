import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { supabase } from "@/integrations/supabase/client";
import type { ParsedDocument, ParsedResume } from '@/types';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const BATCH_SIZE = 10;

// Enhanced name patterns for different formats
const NAME_PATTERNS = [
  // Common name format at the top of resume
  /^[\s\n]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})[\s\n]*/,
  // Name with possible credentials
  /^[\s\n]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\s*,\s*[A-Za-z\s\.]+)?[\s\n]*/,
  // Name in header section
  /(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})(?:\n|$)/,
  // Name after possible title like "Curriculum Vitae" or "Resume"
  /(?:curriculum vitae|resume|cv)[\s\n:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i
];

// Enhanced email patterns for exhaustive extraction
const EMAIL_PATTERNS = [
  // Standard email pattern with optional parts and international characters
  /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/gi,
  // Simplified pattern to catch potential missed emails
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Pattern for emails with subdomain
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\.[A-Za-z]{2,}/g,
  // Email preceded by "Email:" or "E:"
  /(?:Email|E-mail|E):?\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i
];

// Update the cleanAndValidatePhone function to be more strict
const cleanAndValidatePhone = (phone: string): string => {
  // Don't process strings that are clearly not phone numbers
  if (phone.toLowerCase().includes('mobile') || 
      phone.toLowerCase().includes('phone') || 
      phone.toLowerCase().includes('cell') || 
      phone.toLowerCase().includes('tel')) {
    return '';
  }

  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // Basic validation - must have enough digits
  const digitCount = cleaned.replace(/\D/g, '').length;
  if (digitCount < 10 || digitCount > 15) {
    return '';
  }

  // Check for valid patterns
  const isValid = (number: string): boolean => {
    // Must start with + or a digit
    if (!/^[+\d]/.test(number)) return false;
    
    // Must not have multiple + symbols
    if ((number.match(/\+/g) || []).length > 1) return false;
    
    // If starts with +, must be followed by 1-3 digits for country code
    if (number.startsWith('+') && !/^\+\d{1,3}/.test(number)) return false;
    
    return true;
  };

  // Format number consistently
  const formatNumber = (number: string): string => {
    const digits = number.replace(/\D/g, '');
    
    // Handle Indian numbers (assuming most numbers will be Indian)
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    
    // Handle numbers with country code
    if (digits.length > 10 && digits.length <= 15) {
      if (cleaned.startsWith('+')) {
        return cleaned;
      }
      return `+${digits}`;
    }
    return '';
  };

  if (isValid(cleaned)) {
    return formatNumber(cleaned);
  }
  return '';
};

// Update phone patterns to be more strict
const PHONE_PATTERNS = [
  // Standard formats with mandatory country code
  /(?:\+\d{1,3}[-.\s]?)?\d{10}/g,
  
  // International format with parentheses
  /\+\d{1,3}\s*\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/g,
  
  // Standard Indian mobile format
  /[6789]\d{9}/g,
  
  // Numbers with dots or dashes as separators
  /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/g,
];

const extractContactInfo = (text: string) => {
  // Clean and normalize text
  const cleanText = text
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();

  // Split text into sections for targeted search
  const lines = cleanText.split('\n');
  const sections = {
    header: lines.slice(0, Math.min(10, lines.length)).join('\n'),
    contact: lines.slice(0, Math.min(20, lines.length)).join('\n'),
    full: cleanText
  };

  let emails: string[] = [];
  let phones: string[] = [];

  // Search for emails using existing patterns
  for (const pattern of EMAIL_PATTERNS) {
    // First try header section
    const headerEmails = sections.header.match(pattern) || [];
    emails = [...emails, ...headerEmails];

    // If not found in header, try contact section
    if (emails.length === 0) {
      const contactEmails = sections.contact.match(pattern) || [];
      emails = [...emails, ...contactEmails];
    }

    // If still not found, search full text
    if (emails.length === 0) {
      const fullEmails = sections.full.match(pattern) || [];
      emails = [...emails, ...fullEmails];
    }
  }

  // Enhanced phone number search with priority sections
  for (const pattern of PHONE_PATTERNS) {
    // Search in header first (most likely location)
    let matches = sections.header.match(pattern) || [];
    
    // If no matches in header, try the contact section
    if (matches.length === 0) {
      matches = sections.contact.match(pattern) || [];
    }
    
    // If still no matches, search the full document
    if (matches.length === 0) {
      matches = sections.full.match(pattern) || [];
    }
    
    // Process each match
    matches.forEach(match => {
      // Extract phone number from label if present
      const phoneMatch = match.match(/(?:Phone|Mobile|Cell|Tel|Telephone|Contact|Ph|Phone Number):?\s*([+\d\s\(\)-\.]{10,})/i);
      const phoneNumber = phoneMatch ? phoneMatch[1] : match;
      
      // Clean and validate the phone number
      const cleanedPhone = cleanAndValidatePhone(phoneNumber);
      if (cleanedPhone) {
        phones.push(cleanedPhone);
      }
    });
  }

  // Clean and validate emails (keep existing validation)
  const validEmails = [...new Set(emails)]
    .map(email => email.toLowerCase().trim())
    .filter(email => {
      return email.includes('@') && 
             email.includes('.') && 
             email.length >= 5 && 
             !email.includes('..') &&
             !email.startsWith('.') &&
             !email.endsWith('.') &&
             !email.includes('@.') &&
             !email.includes('.@') &&
             email.split('@')[1].includes('.') &&
             !/\s/.test(email);
    });

  // Remove duplicates and invalid formats
  const validPhones = [...new Set(phones)]
    .map(phone => cleanAndValidatePhone(phone))
    .filter(Boolean);

  return {
    email: validEmails[0] || '',
    phone: validPhones[0] || ''
  };
};

const extractName = (text: string): string => {
  // Clean and normalize text
  const cleanText = text
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();

  // Get first 10 lines for header section
  const headerSection = cleanText.split('\n').slice(0, 10).join('\n');

  for (const pattern of NAME_PATTERNS) {
    // Try to find name in header section first
    const headerMatch = headerSection.match(pattern);
    if (headerMatch && headerMatch[1]) {
      // Validate and clean the extracted name
      const name = headerMatch[1].trim();
      if (name.length > 2 && name.length < 50 && /^[A-Za-z\s]+$/.test(name)) {
        return name;
      }
    }
  }

  // If no name found in header, try the full text
  for (const pattern of NAME_PATTERNS) {
    const fullMatch = cleanText.match(pattern);
    if (fullMatch && fullMatch[1]) {
      const name = fullMatch[1].trim();
      if (name.length > 2 && name.length < 50 && /^[A-Za-z\s]+$/.test(name)) {
        return name;
      }
    }
  }

  return '';
};

export const parseDocument = async (file: File, type: 'resume' | 'jd'): Promise<ParsedDocument | ParsedResume> => {
  try {
    const text = await getTextFromFile(file);
    
    // Add retry logic for API calls
    let retries = 3;
    let lastError;
    
    while (retries > 0) {
      try {
        const { data, error } = await supabase.functions.invoke('parse-document', {
          body: { documentText: text, documentType: type }
        });

        if (error) throw error;

        if (type === 'resume') {
          const contactInfo = extractContactInfo(text);
          const name = extractName(text);
          return {
            title: data.title || '',
            name: name || data.name || '',
            email: contactInfo.email || data.email || '',
            phone: contactInfo.phone || data.phone || '',
            skills: Array.isArray(data.skills) ? data.skills : [data.skills].filter(Boolean),
            experience: data.experience?.toString() || '',
            education: data.education || '',
            responsibilities: []
          } as ParsedResume;
        } else {
          return {
            title: data.title || '',
            skills: Array.isArray(data.skills) ? data.skills : [data.skills].filter(Boolean),
            experience: data.experience?.toString() || '',
            responsibilities: Array.isArray(data.responsibilities) ? data.responsibilities : [data.responsibilities].filter(Boolean)
          };
        }
      } catch (error) {
        lastError = error;
        retries--;
        if (retries > 0) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, 3 - retries) * 1000));
        }
      }
    }
    
    throw lastError;
  } catch (error) {
    console.error('Error parsing document:', error);
    throw error;
  }
};

const getTextFromFile = async (file: File): Promise<string> => {
  try {
    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ');
      }
      return text;
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    return '';
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw new Error(`Failed to extract text from ${file.name}`);
  }
};

export const processBatch = async <T extends File>(
  files: T[],
  type: 'resume' | 'jd',
  onProgress?: (progress: number) => void
): Promise<ParsedDocument[]> => {
  const results: ParsedDocument[] = [];
  const totalFiles = files.length;
  
  // Process files in batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const batchPromises = batch.map(file => parseDocument(file, type));
    
    try {
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error(`Failed to parse ${batch[index].name}:`, result.reason);
        }
      });
      
      // Update progress
      if (onProgress) {
        const progress = Math.min(((i + batch.length) / totalFiles) * 100, 100);
        onProgress(progress);
      }
      
      // Add a small delay between batches to prevent overwhelming the system
      if (i + BATCH_SIZE < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Batch processing error:', error);
    }
  }
  
  return results;
};

export default {
  parseDocument,
  processBatch,
};
