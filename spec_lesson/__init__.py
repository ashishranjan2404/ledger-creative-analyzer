"""spec-lesson: ADHD live meeting assistant.

Captures meeting audio or stdin transcript, runs three LLM tiers (context
distillation, drift detection, real-time response suggestions), and writes
structured notes to CLAUDE.md at session end.
"""
__version__ = "0.1.0"
