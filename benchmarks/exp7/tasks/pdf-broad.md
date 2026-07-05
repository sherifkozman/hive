# Task: pdf / BROAD

Design and implement a document-processing pipeline `pipeline.py` for a legal
team. Input: a folder of mixed PDFs (some text-based, some scanned). Steps:

1. Classify each PDF as text-based or scanned (show the detection logic).
2. Text-based: extract text and tables (tables to CSV).
3. Scanned: OCR to searchable text.
4. Merge all processed PDFs into one master file with a generated cover page
   (title, date, file inventory), watermark every page "CONFIDENTIAL",
   and encrypt the output with a password.
5. Produce a per-file processing report (pages, method used, warnings).

Choose the right library for each step and say why; note license concerns if
any apply. Deliver the complete script plus a dependencies list and a short
operations section (how to run, common failure modes). Correct library
selection and per-step methodology is the primary grading criterion.
