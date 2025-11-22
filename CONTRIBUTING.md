# Contributing to Rocket Control System

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/rocket-control-system.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test thoroughly
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request

## Development Workflow

### Setting Up Development Environment

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Making Changes

1. **Backend Changes**
   - Follow PEP 8 style guide
   - Add type hints
   - Write docstrings
   - Update tests if applicable

2. **Frontend Changes**
   - Follow ESLint rules
   - Use functional components with hooks
   - Maintain component structure
   - Update PropTypes if needed

### Testing

Before submitting:
- Run existing tests
- Test on both Windows and Linux if possible
- Test hardware integration if applicable
- Check for linting errors

### Commit Messages

Use conventional commit format:

```
feat: Add new emergency sequence
fix: Resolve WebSocket reconnection issue
docs: Update API documentation
refactor: Simplify buffer management
test: Add sensor mapping tests
```

## Pull Request Process

1. **Update Documentation**
   - Update README.md if needed
   - Add/update code comments
   - Update API documentation

2. **Describe Changes**
   - Clear title and description
   - List changes made
   - Mention any breaking changes
   - Include screenshots if UI changes

3. **Request Review**
   - Tag relevant maintainers
   - Respond to feedback promptly
   - Make requested changes

## Coding Standards

### Python

- Use type hints
- Follow PEP 8
- Maximum line length: 100 characters
- Use f-strings for formatting
- Document complex functions

### JavaScript/React

- Use functional components
- Prefer hooks over class components
- Use meaningful variable names
- Keep components small and focused
- Use ESLint configuration

## Areas for Contribution

- Bug fixes
- New features
- Documentation improvements
- Performance optimizations
- Test coverage
- UI/UX improvements
- Hardware integration
- Security enhancements

## Questions?

Open an issue or start a discussion on GitHub!

