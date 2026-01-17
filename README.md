# NestJS Application - Documentation

## Project Overview

This is a NestJS backend application built with TypeScript. The main goal was to set up a solid foundation that can grow into a larger application without needing major refactoring later.

## Architecture

### Modular Structure

The application uses NestJS modules to organize code by features. Right now there's a `UsersModule` as an example, but the same pattern applies when adding more features like payments, or anything else.

**Why modules?**
- Each feature lives in its own folder with everything it needs
- Changes to one module don't break others
- New developers can understand the codebase faster
- Testing becomes simpler when code is isolated

### Configuration Management

Instead of hardcoding values like port numbers or database credentials, I use environment variables. The `ConfigModule` loads settings from `.env.local` during development.

**Why this approach?**
- The same code works in development, staging, and production with different settings
- Secrets stay out of version control
- Changing a setting doesn't require code changes
- The configuration file (`configuration.ts`) serves as documentation for what settings exist

### TypeScript

The entire application is written in TypeScript, not just because NestJS recommends it, but because it actually prevents bugs. Type checking catches mistakes before the code even runs.

## Setup Instructions

### Prerequisites
- Node.js 24.x (LTS)
- npm or yarn

### Installation
```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Edit .env.local with your settings
```

### Running the Application
```bash
npm run start:dev
```

The application runs on `http://localhost:3000` by default.
