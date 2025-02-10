import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from './ui/button';
import { Download, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from 'react';
import { ParsedHistoryEntry } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ParsingHistory = () => {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<any | null>(null);
  const queryClient = useQueryClient();

  const { data: history, isLoading, error } = useQuery({
    queryKey: ['parsing-history'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      console.log('Fetching history for user:', user.id); // Debug log

      const { data, error } = await supabase
        .from('parsing_history')
        .select('*')
        .eq('document_type', 'resume')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching history:', error);
        throw error;
      }

      console.log('Fetched history data:', data); // Debug log
      return data as ParsedHistoryEntry[];
    },
    refetchInterval: 5000, // Automatically refetch every 5 seconds
  });

  const downloadReport = (report: any[]) => {
    const reportData = report.map((entry, index) => ({
      'Sl No': index + 1,
      'JD Name': entry.bestMatchingPosition || '',
      'Resume Name': entry.fileName || '',
      'Candidate Name': entry.name || '',
      'Email': entry.email || '',
      'Phone Number': entry.phone || '',
      'Candidate Experience': entry.experience || '',
      'JD Experience': entry.positionMatches?.find((match: any) => match.title === entry.bestMatchingPosition)?.experience || '',
      'Candidate Skills': Array.isArray(entry.skills) ? entry.skills.join(', ') : '',
      'JD Skills': entry.positionMatches?.find((match: any) => match.title === entry.bestMatchingPosition)?.skills?.join(', ') || '',
      'Skills Match %': `${entry.matchPercentage || 0}%`,
      'Result Based on Skill': getStatusText(entry.matchPercentage || 0),
      'Result Based on Experience': getExperienceResult(
        entry.experience || '0',
        entry.positionMatches?.find((match: any) => match.title === entry.bestMatchingPosition)?.experience || '0'
      ),
    }));

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    XLSX.writeFile(workbook, `parsed_report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
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

  const renderReportPreview = (content: any) => {
    if (!content || !content.report) return null;
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sl No</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">JD Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Resume Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Name</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone Number</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Experience</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">JD Experience</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Candidate Skills</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">JD Skills</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Skills Match %</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result Based on Skill</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result Based on Experience</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {content.report.map((entry: any, index: number) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.bestMatchingPosition || ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.fileName || ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.name || ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.email || ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.phone || ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.experience || ''}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {entry.positionMatches?.find((match: any) => match.title === entry.bestMatchingPosition)?.experience || ''}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {Array.isArray(entry.skills) ? entry.skills.join(', ') : ''}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {entry.positionMatches?.find((match: any) => match.title === entry.bestMatchingPosition)?.skills?.join(', ') || ''}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.matchPercentage || 0}%</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getStatusText(entry.matchPercentage || 0)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {getExperienceResult(
                    entry.experience || '0',
                    entry.positionMatches?.find((match: any) => match.title === entry.bestMatchingPosition)?.experience || '0'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const deleteRecord = async (id: string) => {
    try {
      const { error } = await supabase
        .from('parsing_history')
        .delete()
        .eq('id', id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['parsing-history'] });
      toast({
        title: "Success",
        description: "Record deleted successfully",
      });
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) return <div>Loading history...</div>;

  if (error) {
    console.error('History fetch error:', error);
    return <div>Error loading history. Please try again later.</div>;
  }

  console.log('Rendering history items:', history?.length); // Debug log

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold mb-4">Recent Reports ({history?.length || 0})</h2>
      {history?.length === 0 ? (
        <div className="text-center text-gray-500">No reports available</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {history?.map((record) => (
            <div key={record.id} className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
              <button
                onClick={() => {
                  console.log('Clicked record:', record.parsed_content); // Debug log
                  setPreviewContent(record.parsed_content);
                }}
                className="text-left flex-1"
              >
                <span className="text-primary-darker hover:text-primary hover:underline">
                  Report from {format(new Date(record.created_at), 'PPpp')}
                </span>
              </button>
              <div className="flex gap-2">
                {record.parsed_content.report && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      downloadReport(record.parsed_content.report);
                    }}
                  >
                    <Download className="w-4 h-4 mr-1" /> Download
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setSelectedId(record.id);
                    setDeleteConfirmOpen(true);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete this report from your history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedId) {
                  deleteRecord(selectedId);
                }
                setDeleteConfirmOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!previewContent} onOpenChange={() => setPreviewContent(null)}>
        <DialogContent className="max-w-[90vw] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Content</DialogTitle>
            <DialogDescription>
              Showing details for the selected entry
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {renderReportPreview(previewContent)}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParsingHistory;
