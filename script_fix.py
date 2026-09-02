import sys

with open('app/(dashboard)/investors/page.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_match_modal = False
skip_form = False
brace_count = 0

for line in lines:
    if 'matchOpen &&' in line:
        in_match_modal = True
    
    if in_match_modal and '<div className="inv-modal-body">' in line:
        new_lines.append(line)
        # We know the next line is the injected form because we replaced both.
        # Actually, let's just find the form and remove it.
        continue
    
    new_lines.append(line)

# Let's just do a simpler fix: replace the first occurrence of the injected form with nothing, 
# or just restore from git and re-apply correctly.
