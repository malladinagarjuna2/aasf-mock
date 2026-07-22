import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Participant } from "../context/QuizContext";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function exportResultsToCSV(
  quizTitle: string, 
  roomCode: string, 
  participants: Participant[], 
  denominator: number
) {
  const headers = [
    "Rank",
    "Student Name",
    "Roll Number",
    "Email",
    "Status",
    "Score",
    "Total Questions",
    "Percentage (%)",
    "Answered Questions",
    "Time Taken (s)",
    "Disqualified",
    "Student Query"
  ];

  const sorted = [...participants].sort((a, b) => (b.score || 0) - (a.score || 0));

  const rows = sorted.map((p, idx) => {
    const score = p.score || 0;
    const percentage = denominator > 0 ? Math.round((score / denominator) * 100) : 0;
    const answeredCount = p.answers ? Object.values(p.answers).filter(Boolean).length : 0;
    
    return [
      idx + 1,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.roll || '').replace(/"/g, '""')}"`,
      `"${(p.email || '').replace(/"/g, '""')}"`,
      `"${(p.isDisqualified ? 'Disqualified' : p.status || 'Appearing').replace(/"/g, '""')}"`,
      score,
      denominator,
      `"${percentage}%"`,
      answeredCount,
      p.timeTaken || 0,
      p.isDisqualified ? 'Yes' : 'No',
      `"${(p.query || '').replace(/"/g, '""')}"`
    ];
  });

  const csvContent = [
    `# Quiz Title: "${(quizTitle || 'Quiz').replace(/"/g, '""')}"`,
    `# Room Code: "${roomCode || ''}"`,
    `# Date Exported: "${new Date().toLocaleString()}"`,
    "",
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const filename = `${(quizTitle || 'Quiz').replace(/[^a-z0-9]/gi, '_')}_Results_${roomCode || 'Export'}.csv`;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
