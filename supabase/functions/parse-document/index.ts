import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.1.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Implement exponential backoff retry logic
async function retryWithExponentialBackoff(
  operation: () => Promise<any>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<any> {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if it's a rate limit error
      if (error.message.includes('429') || error.message.includes('quota')) {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Rate limited. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If it's not a rate limit error, throw immediately
      throw error;
    }
  }
  
  throw lastError;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentText, documentType } = await req.json();
    console.log(`Processing ${documentType} document`);

    const genAI = new GoogleGenerativeAI(Deno.env.get('GEMINI_API_KEY') || '');
    const model = genAI.getGenerativeModel({ 
      model: "gemini-pro",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const prompt = documentType === 'resume' ? 
      `Extract information from this resume and return it in JSON format. Focus on finding:
      - Full name (usually at the top)
      - Email address (look for @ symbol)
      - Phone number (any standard format with numbers)
      - List of technical skills (especially programming languages, frameworks, tools)
      - Years of experience (look for numbers followed by "years" or similar patterns)
      - Education details (highest degree and institution)

      Return ONLY a valid JSON object like this example, no other text:
      {
        "name": "John Smith",
        "email": "john@example.com",
        "phone": "+1-234-567-8900",
        "skills": ["AWS", "Python", "Java"],
        "experience": "5",
        "education": "BS Computer Science, XYZ University"
      }

      Parse this resume text:
      ${documentText}`
      :
      `Extract information from this job description and return it in JSON format. Focus on finding:
      - Job title (position name)
      - Required technical skills - be thorough and extract ALL technical skills including:
        * Programming languages (e.g., Python, Java, JavaScript, C++, etc.)
        * Frameworks & libraries (e.g., React, Node.js, Django, Spring, etc.)
        * Cloud platforms (e.g., AWS, Azure, GCP)
        * Databases (e.g., MySQL, PostgreSQL, MongoDB)
        * Tools & technologies (e.g., Docker, Kubernetes, Git)
        * Data science tools (e.g., TensorFlow, PyTorch, Pandas)
        * Project management methodologies (e.g., Agile, Scrum, Kanban, SAFe)
        * Business intelligence tools (e.g., PowerBI, Tableau, Looker)
        * ETL tools and processes
        * AI/ML tools (e.g., MidJourney, ChatGPT, Stable Diffusion)
        * Any other technical tools or platforms mentioned
      - Required years of experience
      - Key responsibilities

      Return ONLY a valid JSON object like this example, no other text:
      {
        "title": "Senior Software Engineer",
        "skills": ["Python", "Django", "AWS", "Docker", "PostgreSQL", "Git", "Agile", "Scrum", "ETL", "PowerBI", "Kanban", "SAFe", "MidJourney"],
        "experience": "5",
        "responsibilities": ["Lead development team", "Design system architecture"]
      }

      Parse this job description:
      ${documentText}`;

    // Use retry logic for the API call
    const result = await retryWithExponentialBackoff(async () => {
      return await model.generateContent(prompt);
    });

    if (!result) {
      throw new Error('Failed to generate content after multiple attempts');
    }

    const response = await result.response;
    const text = response.text();
    
    console.log('Raw Gemini response:', text);

    try {
      const jsonStr = text.trim()
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      
      const parsedData = JSON.parse(jsonStr);
      
      if (documentType === 'resume') {
        if (!parsedData.name || !parsedData.skills || !Array.isArray(parsedData.skills)) {
          throw new Error('Invalid resume data structure');
        }
      } else {
        if (!parsedData.title || !parsedData.skills || !Array.isArray(parsedData.skills)) {
          throw new Error('Invalid job description data structure');
        }
      }

      console.log('Successfully parsed document:', parsedData);
      return new Response(
        JSON.stringify(parsedData),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (e) {
      console.error('Failed to parse Gemini response:', e);
      throw new Error(`Failed to parse Gemini response: ${e.message}`);
    }
  } catch (error) {
    console.error('Error in parse-document function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});