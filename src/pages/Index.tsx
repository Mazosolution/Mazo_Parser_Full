import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FileUpload from '@/components/FileUpload';
import CandidateTable, { Candidate } from '@/components/CandidateTable';
import ParsingHistory from '@/components/ParsingHistory';
import UserManagement from '@/components/UserManagement';
import { parseDocument, processBatch } from '@/components/DocumentParser';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PositionMatch, ParsedDocument, ParsedResume } from '@/types';
import { Button } from '@/components/ui/button';
import { LogOut, Play } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

const MAX_JD_COUNT = 10;
const MAX_RESUME_COUNT = 25;
const MAX_BATCH_SIZE = 100;

const Index = () => {
  const [jobDescriptions, setJobDescriptions] = useState<ParsedDocument[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [currentReport, setCurrentReport] = useState<Candidate[]>([]);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const handleJDUpload = async (files: File[]) => {
    if (files.length > MAX_BATCH_SIZE) {
      toast({
        title: "Warning",
        description: `Maximum ${MAX_BATCH_SIZE} files can be processed at once. Please upload fewer files.`,
        variant: "destructive",
      });
      return;
    }

    if (jobDescriptions.length + files.length > MAX_JD_COUNT) {
      toast({
        title: "Warning",
        description: `You can only upload a maximum of ${MAX_JD_COUNT} job descriptions. You currently have ${jobDescriptions.length} and are trying to add ${files.length} more.`,
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const parsedJDs = await processBatch(files, 'jd', (progress) => {
        // Progress handling if needed
      });

      const validJDs = parsedJDs.filter((jd): jd is ParsedDocument => 
        jd.title !== undefined && jd.skills.length > 0
      );

      for (const parsedJD of validJDs) {
        const parsedContent = {
          title: parsedJD.title,
          skills: parsedJD.skills,
          experience: parsedJD.experience || '',
          responsibilities: parsedJD.responsibilities || []
        };

        await supabase.from('parsing_history').insert({
          document_type: 'job_description',
          parsed_content: parsedContent,
          user_id: user.id
        });
      }

      setJobDescriptions(prev => [...prev, ...validJDs]);
      
      toast({
        title: "Success",
        description: `${validJDs.length} job description(s) uploaded successfully${
          validJDs.length !== files.length ? `. ${files.length - validJDs.length} files failed.` : ''
        }`,
      });
    } catch (error) {
      console.error('JD Upload Error:', error);
      toast({
        title: "Error",
        description: "Failed to parse job descriptions. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleResumeUpload = async (files: File[]) => {
    if (files.length > MAX_BATCH_SIZE) {
      toast({
        title: "Warning",
        description: `Maximum ${MAX_BATCH_SIZE} files can be processed at once. Please upload fewer files.`,
        variant: "destructive",
      });
      return;
    }

    if (candidates.length + files.length > MAX_RESUME_COUNT) {
      toast({
        title: "Warning",
        description: `You can only upload a maximum of ${MAX_RESUME_COUNT} resumes. You currently have ${candidates.length} and are trying to add ${files.length} more.`,
        variant: "destructive",
      });
      return;
    }

    try {
      const parsedResumes = await processBatch(files, 'resume', (progress) => {
        // Progress handling if needed
      });

      const newCandidates = parsedResumes
        .map((parsed, index) => {
          if (!isParseResume(parsed)) return null;
          
          try {
            const positionMatches = findPositionMatches(parsed.skills || [], jobDescriptions);
            const bestMatch = findBestMatch(positionMatches);
            
            return {
              name: parsed.name,
              email: parsed.email,
              phone: parsed.phone,
              skills: parsed.skills,
              experience: parsed.experience,
              education: parsed.education,
              matchPercentage: bestMatch.matchPercentage,
              fileName: files[index].name,
              positionMatches,
              bestMatchingPosition: bestMatch.title
            } as Candidate;
          } catch (error) {
            console.error('Error processing resume:', error);
            return null;
          }
        })
        .filter((candidate): candidate is Candidate => candidate !== null);

      if (newCandidates.length > 0) {
        setCandidates(prev => [...prev, ...newCandidates]);
        toast({
          title: "Success",
          description: `${newCandidates.length} resume(s) uploaded successfully${
            newCandidates.length !== files.length ? `. ${files.length - newCandidates.length} files failed.` : ''
          }`,
        });
      }

      if (newCandidates.length !== files.length) {
        toast({
          title: "Warning",
          description: `${files.length - newCandidates.length} resume(s) failed to parse`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Resume Upload Error:', error);
      toast({
        title: "Error",
        description: "Failed to process resumes. Please try again.",
        variant: "destructive",
      });
    }
  };

  const calculateMatchPercentage = (candidateSkills: string[], requiredSkills: string[]) => {
    const matchingSkills = candidateSkills.filter(skill => 
      requiredSkills.some(requiredSkill => 
        requiredSkill.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(requiredSkill.toLowerCase())
      )
    );
    
    return Math.round((matchingSkills.length / requiredSkills.length) * 100);
  };

  const findPositionMatches = (candidateSkills: string[], jds: ParsedDocument[]): PositionMatch[] => {
    return jds.map(jd => ({
      title: jd.title,
      matchPercentage: calculateMatchPercentage(candidateSkills, jd.skills),
      experience: jd.experience,
      skills: jd.skills
    }));
  };

  const findBestMatch = (positionMatches: PositionMatch[]): PositionMatch => {
    return positionMatches.reduce(
      (best, current) => 
        current.matchPercentage > best.matchPercentage ? current : best,
      positionMatches[0] || { title: '', matchPercentage: 0, experience: '', skills: [] }
    );
  };

  const isParseResume = (doc: ParsedDocument | ParsedResume): doc is ParsedResume => {
    return 'name' in doc && 'email' in doc && 'phone' in doc && 'education' in doc;
  };

  const handleParse = async () => {
    if (jobDescriptions.length === 0 || candidates.length === 0) {
      toast({
        title: "Error",
        description: "Please upload both job descriptions and resumes before parsing.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const groupedCandidates = jobDescriptions.flatMap(jd => {
        return candidates
          .map(candidate => {
            const matchForJD = candidate.positionMatches.find(match => match.title === jd.title);
            if (!matchForJD) return null;

            return {
              ...candidate,
              matchPercentage: matchForJD.matchPercentage,
              bestMatchingPosition: jd.title
            } as Candidate;
          })
          .filter((c): c is Candidate => c !== null);
      });

      setCurrentReport(groupedCandidates);

      const parsedContent = {
        report: groupedCandidates.map(candidate => ({
          name: candidate.name,
          email: candidate.email,
          phone: candidate.phone,
          skills: candidate.skills,
          experience: candidate.experience,
          education: candidate.education,
          matchPercentage: candidate.matchPercentage,
          fileName: candidate.fileName,
          bestMatchingPosition: candidate.bestMatchingPosition,
          positionMatches: candidate.positionMatches.map(match => ({
            title: match.title,
            matchPercentage: match.matchPercentage,
            experience: match.experience,
            skills: match.skills
          }))
        }))
      };

      await supabase.from('parsing_history').insert({
        document_type: 'resume' as const,
        parsed_content: parsedContent,
        user_id: user.id
      });

      toast({
        title: "Success",
        description: "Parsing completed successfully. Check history for the report.",
      });

      setCandidates([]);
      setJobDescriptions([]);
    } catch (error) {
      console.error('Parsing Error:', error);
      toast({
        title: "Error",
        description: "Failed to generate report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const { data: userRole } = useQuery({
    queryKey: ['user-role'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      return data?.role || null;
    },
  });

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Mazo Beam Parser</h1>
        <Button variant="outline" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" /> Logout
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold mb-4">Upload Job Descriptions</h2>
          <p className="text-sm text-gray-500 mb-2">Maximum {MAX_JD_COUNT} job descriptions allowed. Currently uploaded: {jobDescriptions.length}</p>
          <FileUpload
            onFileUpload={handleJDUpload}
            accept={{
              'application/pdf': ['.pdf'],
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            }}
            title="Upload JDs"
          />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold mb-4">Upload Resumes</h2>
          <p className="text-sm text-gray-500 mb-2">Maximum {MAX_RESUME_COUNT} resumes allowed. Currently uploaded: {candidates.length}</p>
          <FileUpload
            onFileUpload={handleResumeUpload}
            accept={{
              'application/pdf': ['.pdf'],
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
            }}
            title="Upload Resumes"
          />
        </div>
      </div>

      {(jobDescriptions.length > 0 && candidates.length > 0) && (
        <div className="flex justify-center">
          <Button
            onClick={handleParse}
            className="px-8"
          >
            <Play className="w-4 h-4 mr-2" /> Parse Documents
          </Button>
        </div>
      )}

      {currentReport.length > 0 && (
        <div className="mt-8">
          <CandidateTable candidates={currentReport} />
        </div>
      )}

      <ParsingHistory />

      {userRole === 'admin' && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">User Management</h2>
          <UserManagement />
        </div>
      )}
    </div>
  );
};

export default Index;
