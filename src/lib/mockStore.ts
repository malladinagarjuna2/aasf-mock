// Local storage keys
const QUIZZES_KEY = 'demo_quizzes';
const RESPONSES_KEY = 'demo_responses';

export const mockStore = {
  getQuizzes: () => {
    const saved = localStorage.getItem(QUIZZES_KEY);
    return saved ? JSON.parse(saved) : [];
  },
  saveQuiz: (quiz: any) => {
    const quizzes = mockStore.getQuizzes();
    const existingIndex = quizzes.findIndex((q: any) => q.id === quiz.id);
    if (existingIndex >= 0) {
      quizzes[existingIndex] = quiz;
    } else {
      quizzes.push(quiz);
    }
    localStorage.setItem(QUIZZES_KEY, JSON.stringify(quizzes));
  },
  deleteQuiz: (quizId: string) => {
    const quizzes = mockStore.getQuizzes().filter((q: any) => q.id !== quizId);
    localStorage.setItem(QUIZZES_KEY, JSON.stringify(quizzes));
    // Also delete associated responses
    const responses = mockStore.getAllResponses();
    const filteredResponses = responses.filter((r: any) => r.quizId !== quizId);
    localStorage.setItem(RESPONSES_KEY, JSON.stringify(filteredResponses));
  },
  getAllResponses: () => {
    const saved = localStorage.getItem(RESPONSES_KEY);
    return saved ? JSON.parse(saved) : [];
  },
  getResponsesForQuiz: (quizId: string) => {
    return mockStore.getAllResponses().filter((r: any) => r.quizId === quizId);
  },
  saveResponse: (response: any) => {
    const responses = mockStore.getAllResponses();
    const existingIndex = responses.findIndex((r: any) => r.quizId === response.quizId && r.roll === response.roll);
    if (existingIndex >= 0) {
      responses[existingIndex] = { ...responses[existingIndex], ...response };
    } else {
      responses.push(response);
    }
    localStorage.setItem(RESPONSES_KEY, JSON.stringify(responses));
  },
  deleteResponse: (quizId: string, roll: string) => {
    const responses = mockStore.getAllResponses();
    const filtered = responses.filter((r: any) => !(r.quizId === quizId && r.roll === roll));
    localStorage.setItem(RESPONSES_KEY, JSON.stringify(filtered));
  },
  updateResponse: (roll: string, updates: any) => {
    const responses = mockStore.getAllResponses();
    const existingIndex = responses.findIndex((r: any) => r.roll === roll);
    if (existingIndex >= 0) {
      responses[existingIndex] = { ...responses[existingIndex], ...updates };
      localStorage.setItem(RESPONSES_KEY, JSON.stringify(responses));
    }
  }
};
