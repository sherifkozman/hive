# Task: pdf / NARROW

A user has `application.pdf`, a government form that is NOT fillable (it is a
flat scanned-style form with no AcroForm fields), and a `data.json` of the
applicant's answers. Produce:

1. A complete, runnable Python solution that fills this form by overlaying
   text at the right positions, following the recommended workflow for
   non-fillable forms (including how to determine coordinates accurately and
   how to validate the result).
2. A checklist the user should follow to verify placement correctness before
   submitting.
3. A short section: how the solution would differ if the form HAD fillable
   AcroForm fields (library choice and code sketch).

Correct methodology for form-filling (fillable vs non-fillable distinction,
coordinate workflow, verification) is the primary grading criterion.
