# 🧠 SkillForge Server

**SkillForge Server** is the backend API for SkillForge, an AI-powered learning platform designed to help students learn, track their progress, and get AI-powered assistance from a single platform.

The server provides RESTful APIs for authentication, users, courses, enrollments, payments, mentor sessions, categories, and AI-powered learning assistance.

## 🔗 Related Project

🌐 **Live Website:** https://skillforge-ai-eta.vercel.app

💻 **Frontend:** https://github.com/sanjana-moon/SkillForge

## ✨ Features

* 🔐 JWT-based authentication
* 👥 Role-based access control
* 🎓 Course management
* 📚 Student enrollment management
* 🧑‍🏫 Mentor session management
* 🤖 Gemini AI integration
* 💬 AI-powered learning assistance
* 💳 Payment management
* 📊 Learning progress management
* 🗂️ Course category management
* 👤 User profile management
* 🛡️ Admin and instructor management
* 🗄️ MongoDB database integration
* 🔄 RESTful API architecture

## 👥 User Roles

SkillForge supports three primary roles:

### 🎓 Student

Students can:

* Browse available courses
* Enroll in courses
* Track learning progress
* Access enrolled courses
* Get AI-powered assistance
* Book mentor sessions
* Manage their profile

### 🧑‍🏫 Instructor

Instructors can:

* Create courses
* Manage course content
* Monitor enrolled students
* Manage course-related information
* Manage mentor sessions

### 🛡️ Admin

Administrators can:

* Manage users
* Manage courses
* Manage instructors
* Manage categories
* Monitor platform activities
* Manage the overall system

## 🤖 AI Integration

SkillForge integrates **Google Gemini AI** to provide an AI-powered learning assistant.

The AI assistant can help learners by:

* Answering learning-related questions
* Explaining technical concepts
* Providing contextual guidance
* Supporting the learning process

The AI functionality is handled on the server so that sensitive API credentials are never exposed to the client.

```text
Student
   │
   ▼
Frontend
   │
   ▼
SkillForge API
   │
   ▼
Gemini AI
   │
   ▼
AI Response
   │
   ▼
Student
```

## 🧰 Tech Stack

### Backend

* **Node.js**
* **Express.js**
* **JavaScript**
* **REST API**

### Database

* **MongoDB**

### Authentication

* **JWT**
* **HTTP Authentication Middleware**

### AI

* **Google Gemini API**

### Payments

* **Payment API Integration**

### Development Tools

* **Git & GitHub**
* **Postman**
* **npm**
* **VS Code**

## 📁 Project Structure

```text
skillforge-server/
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middlewares/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── .env
├── package.json
├── package-lock.json
└── README.md
```

## 🗄️ Database

SkillForge uses **MongoDB** as its primary database.

The application manages data related to:

```text
Users
Courses
Enrollments
Payments
Categories
Mentor Sessions
```

The database is structured to support different user roles and the relationships between learners, courses, instructors, enrollments, payments, and mentoring.

## 🔐 Authentication & Authorization

SkillForge uses **JWT-based authentication** to protect private API resources.

The general authentication flow is:

```text
User Login
    │
    ▼
Credentials Verification
    │
    ▼
JWT Generated
    │
    ▼
Client Stores Token
    │
    ▼
Protected API Request
    │
    ▼
JWT Verification
    │
    ▼
Role Verification
    │
    ▼
Authorized Resource
```

Role-based authorization ensures that users can only access resources permitted for their role.

## 🎓 Course Management

The backend provides APIs for managing courses, including:

* Creating courses
* Retrieving courses
* Retrieving course details
* Updating courses
* Deleting courses
* Managing course categories
* Managing course-related information

## 📚 Enrollment System

Students can enroll in available courses.

The server handles:

* Course enrollment
* Enrollment validation
* Student-course relationships
* Enrollment information
* Learning progress data

## 🧑‍🏫 Mentor Sessions

SkillForge includes mentor-session functionality that allows students to connect with instructors/mentors.

The backend manages:

* Mentor session creation
* Session information
* Student requests
* Session management

## 💳 Payment System

The backend handles payment-related operations for paid courses.

The payment flow follows the general structure:

```text
Select Course
     │
     ▼
Create Payment
     │
     ▼
Payment Processing
     │
     ▼
Payment Confirmation
     │
     ▼
Course Enrollment
```

Sensitive payment-related credentials and configuration are stored securely through environment variables.

## 🔄 API Architecture

```text
                    Client
                      │
                      ▼
                Express Server
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
 Authentication   API Routes    AI Services
        │             │             │
        ▼             ▼             ▼
   JWT Middleware  Controllers   Gemini API
                      │
                      ▼
                  MongoDB
```

## 🛡️ Security

The server follows several security practices:

* JWT authentication
* Protected API routes
* Role-based authorization
* Environment-based secret management
* Server-side Gemini API integration
* Server-side payment processing
* Request validation
* Restricted administrative operations

> API keys, database credentials, JWT secrets, and other sensitive information should never be committed to the repository.

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
PORT=5000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_jwt_secret

GEMINI_API_KEY=your_gemini_api_key

CLIENT_URL=your_frontend_url
```

Add any additional environment variables required by your current configuration.

## 🚀 Getting Started

### Prerequisites

Make sure you have:

* Node.js
* npm
* MongoDB
* Git

### Clone the Repository

```bash
git clone https://github.com/sanjana-moon/skillforge-server.git
```

Navigate into the project:

```bash
cd skillforge-server
```

Install dependencies:

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

The API will be available at:

```text
http://localhost:5000
```

## 🧪 API Testing

The API can be tested using **Postman** or any REST API client.

Example API structure:

```text
Authentication
POST   /api/auth/login
POST   /api/auth/register

Users
GET    /api/users
GET    /api/users/:id
PATCH  /api/users/:id

Courses
GET    /api/courses
GET    /api/courses/:id
POST   /api/courses
PATCH  /api/courses/:id
DELETE /api/courses/:id

Categories
GET    /api/categories
POST   /api/categories

Enrollments
POST   /api/enrollments
GET    /api/enrollments

Payments
POST   /api/payments

Mentor Sessions
POST   /api/mentor-sessions
GET    /api/mentor-sessions
```

> Endpoint names may differ from the current implementation.

## 🌐 Deployment

The backend can be deployed to Node.js-compatible hosting platforms.

For production deployment, configure all required environment variables in the hosting provider's environment settings.

## 🔮 Future Improvements

* Advanced AI learning recommendations
* AI-generated personalized learning paths
* Real-time notifications
* Advanced course analytics
* Automated testing
* API documentation with Swagger
* Rate limiting
* Caching
* Improved AI fallback handling
* More advanced instructor analytics

## 👩‍💻 Developer

**Sanjana Moon**

* 🌐 Portfolio: https://sanjana-portfolio-eight-eta.vercel.app
* 💻 GitHub: https://github.com/sanjana-moon
* 💼 LinkedIn: https://linkedin.com/in/sanjana-moon

---

⭐ If you find SkillForge useful, consider giving the repository a star!
