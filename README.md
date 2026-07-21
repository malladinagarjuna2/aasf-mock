# ⚡ Kinetic Educator

[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Kinetic Educator** is a high-energy, real-time educational platform designed to transform traditional classroom assessments into interactive, pulse-pounding experiences. Built for modern educators and students, it bridges the gap between active learning and instant data-driven insights.

---

## 🚀 Key Features

### 👨‍🏫 For Educators
*   **Intuitive Quiz Creator**: Build complex quizzes with support for Multiple Choice, True/False, Multiple Select, and Paragraph answers.
*   **Real-time Room Control**: Start and manage live quiz sessions with unique room codes. 
*   **Dynamic Data Insights**: View instant accuracy reports, student progress, and detailed participation statistics.
*   **Smart Math Support**: Full LaTeX and MathML support via KaTeX for STEM subjects.
*   **Export to Excel**: Download comprehensive reports for grading with a single click.

### 🎓 For Students
*   **Seamless Join Experience**: Jump into live rooms using simple codes—no heavy registration required.
*   **Interactive Interface**: Smooth, animated quiz transitions powered by Framer Motion.
*   **Instant Feedback**: Get your scores and accuracy immediately after submission.
*   **Responsive Design**: A first-class experience on mobile, tablet, and desktop.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, Vite 6, TypeScript |
| **Styling** | Tailwind CSS 4, Material Design 3 Principles |
| **Backend/DB** | Firebase Firestore (Real-time NoSQL) |
| **Auth** | Firebase Authentication (Google & Email/Pass) |
| **Storage** | Firebase Storage (Cloud asset management) |
| **Animations** | Framer Motion |
| **AI (Optional)** | Google Gemini API Integration |

---

## 📐 Architecture Overview

Kinetic Educator follows a **Client-Side Single Page Application (SPA)** architecture with a serverless backend.

1.  **Frontend State**: Uses React Context API (`AuthContext`, `QuizContext`, `ThemeContext`) to manage global application state.
2.  **Real-time Layer**: Leverages Firestore's `onSnapshot` for immediate synchronization between teachers and students.
3.  **Security**: Protected by a multi-layered Firestore Security Rule engine (Attribute-Based Access Control) to prevent unauthorized data access.
4.  **Routing**: Managed by `react-router-dom` with explicit rewrite rules for Vercel/SPA deployments.

---

## 🔒 Security & Performance

*   **Master-Gate Pattern**: Firestore rules enforce relational sync (Students can only join active quizzes).
*   **Zero-Trust Validation**: Every data write is validated against strict schema blueprints on the server side.
*   **Optimized Loading**: Lazy loading and optimized build artifacts for fast execution on low-bandwidth networks.

---

## 🚦 Getting Started

### Prerequisites
*   Node.js (LTS)
*   npm or yarn
*   A Firebase Project

### Installation
1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/kinetic-educator.git
    cd kinetic-educator
    ```
2.  **Install dependencies**
    ```bash
    npm install
    ```
3.  **Configure environment**
    Create a `firebase-applet-config.json` with your Firebase credentials and set your `GEMINI_API_KEY` in `.env`.
4.  **Launch**
    ```bash
    npm run dev
    ```

---

## 📄 License
This project is licensed under the **Apache-2.0 License**.

---
*Built with ❤️ for the next generation of learners.*
