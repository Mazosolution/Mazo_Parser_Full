import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from 'xlsx';
import { format } from 'date-fns';

export interface PositionMatch {
  title: string;
  matchPercentage: number;
  experience?: string;
  skills?: string[];
}

export interface Candidate {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience: string;
  education: string;
  matchPercentage: number;
  fileName: string;
  positionMatches: PositionMatch[];
  bestMatchingPosition?: string;
}

interface CandidateTableProps {
  candidates: Candidate[];
}

const CandidateTable = ({ candidates }: CandidateTableProps) => {
  const getStatusColor = (percentage: number) => {
    if (percentage <= 40) return "text-red-500";
    if (percentage <= 60) return "text-yellow-500";
    return "text-green-500";
  };

  const getStatusText = (percentage: number) => {
    if (percentage <= 40) return "Reject";
    if (percentage <= 60) return "Hold";
    return "Select";
  };

  const getExperienceResult = (candidateExp: string, jdExp: string) => {
    const candidateYears = parseInt(candidateExp) || 0;
    const jdYears = parseInt(jdExp) || 0;
    
    if (candidateYears >= jdYears) return "Qualified";
    if (candidateYears >= jdYears - 2) return "Consider";
    return "Not Qualified";
  };

  const downloadExcel = () => {
    const reportData = candidates.map((candidate, index) => {
      const matchingPosition = candidate.positionMatches.find(
        match => match.title === candidate.bestMatchingPosition
      );

      return {
        'Sl No': index + 1,
        'JD Name': candidate.bestMatchingPosition,
        'Resume Name': candidate.fileName,
        'Candidate Name': candidate.name,
        'Email': candidate.email,
        'Phone Number': candidate.phone,
        'Candidate Experience': candidate.experience,
        'JD Experience': matchingPosition?.experience || 'Not specified',
        'Candidate Skills': candidate.skills.join(', '),
        'JD Skills': matchingPosition?.skills?.join(', ') || 'Not specified',
        'Skills Match %': `${candidate.matchPercentage}%`,
        'Result Based on Skill': getStatusText(candidate.matchPercentage),
        'Result Based on Experience': getExperienceResult(
          candidate.experience,
          matchingPosition?.experience || '0'
        ),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    XLSX.writeFile(workbook, `parsed_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={downloadExcel}
          className="mb-4"
        >
          <Download className="w-4 h-4 mr-2" /> Download Excel
        </Button>
      </div>
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sl No</TableHead>
              <TableHead>JD Name</TableHead>
              <TableHead>Resume Name</TableHead>
              <TableHead>Candidate Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone Number</TableHead>
              <TableHead>Candidate Experience</TableHead>
              <TableHead>JD Experience</TableHead>
              <TableHead>Candidate Skills</TableHead>
              <TableHead>JD Skills</TableHead>
              <TableHead>Skills Match %</TableHead>
              <TableHead>Result Based on Skill</TableHead>
              <TableHead>Result Based on Experience</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.map((candidate, index) => {
              const matchingPosition = candidate.positionMatches.find(
                match => match.title === candidate.bestMatchingPosition
              );
              
              return (
                <TableRow key={index}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{candidate.bestMatchingPosition}</TableCell>
                  <TableCell>{candidate.fileName}</TableCell>
                  <TableCell>{candidate.name}</TableCell>
                  <TableCell>{candidate.email}</TableCell>
                  <TableCell>{candidate.phone}</TableCell>
                  <TableCell>{candidate.experience}</TableCell>
                  <TableCell>
                    {matchingPosition?.experience || 'Not specified'}
                  </TableCell>
                  <TableCell>{candidate.skills.join(', ')}</TableCell>
                  <TableCell>
                    {matchingPosition?.skills?.join(', ') || 'Not specified'}
                  </TableCell>
                  <TableCell>
                    <span className={`font-medium ${getStatusColor(candidate.matchPercentage)}`}>
                      {candidate.matchPercentage}%
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={`font-medium ${getStatusColor(candidate.matchPercentage)}`}>
                      {getStatusText(candidate.matchPercentage)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {getExperienceResult(
                      candidate.experience,
                      matchingPosition?.experience || '0'
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CandidateTable;