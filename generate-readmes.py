#!/usr/bin/env python3
"""
README.md Generator for Talon AI Assistant Project
Automatically creates README.md files for each folder in src/
"""

import os
import json
from pathlib import Path
from typing import Dict, List, Optional

def analyze_folder(folder_path: Path) -> Dict:
    """Analyze a folder and return information about its contents."""
    info = {
        'path': str(folder_path),
        'name': folder_path.name,
        'files': [],
        'subfolders': [],
        'line_counts': {},
        'has_typescript': False,
        'has_javascript': False,
        'has_json': False,
        'has_markdown': False,
    }
    
    for item in folder_path.iterdir():
        if item.is_file():
            info['files'].append(item.name)
            
            # Check file types
            if item.suffix in ['.ts', '.tsx']:
                info['has_typescript'] = True
                # Try to count lines
                try:
                    with open(item, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                        info['line_counts'][item.name] = len(lines)
                except:
                    info['line_counts'][item.name] = 0
                    
            elif item.suffix in ['.js', '.jsx']:
                info['has_javascript'] = True
            elif item.suffix == '.json':
                info['has_json'] = True
            elif item.suffix == '.md':
                info['has_markdown'] = True
                
        elif item.is_dir() and item.name not in ['node_modules', '.git', '__pycache__']:
            info['subfolders'].append(item.name)
    
    return info

def generate_readme_content(folder_info: Dict, parent_info: Optional[Dict] = None) -> str:
    """Generate README.md content based on folder analysis."""
    
    folder_name = folder_info['name']
    if folder_name == 'src':
        project_name = 'Talon AI Assistant'
    else:
        project_name = f'Talon - {folder_name.title()} Module'
    
    # Determine folder purpose based on name
    purpose_map = {
        'agent': 'AI Agent System',
        'memory': 'Memory Management System',
        'cli': 'Command-Line Interface',
        'gateway': 'Main Gateway/Server',
        'tools': 'Tool Definitions and Implementations',
        'utils': 'Utility Functions',
        'types': 'TypeScript Type Definitions',
        'plugins': 'Plugin System',
        'protocol': 'Communication Protocols',
        'storage': 'Data Storage and Persistence',
        'web': 'Web Interface/Dashboard',
        'shadow': 'Shadow/Parallel Execution System',
        'subagents': 'Sub-agent Management',
        'config': 'Configuration Management',
    }
    
    purpose = purpose_map.get(folder_name, f'{folder_name.title()} Module')
    
    # Build README content
    lines = []
    lines.append(f'# 📁 {folder_name}/ - {purpose}')
    lines.append('')
    lines.append('## 🎯 What This Folder Does')
    lines.append(f'[Brief description of what this module does within Talon AI Assistant]')
    lines.append('')
    
    # Key files section
    if folder_info['files']:
        lines.append('## 📄 Key Files')
        for file in sorted(folder_info['files']):
            if file.endswith('.ts') and file in folder_info['line_counts']:
                lines.append(f'- `{file}` - ({folder_info["line_counts"][file]} lines) [Description]')
            elif file.endswith(('.ts', '.js', '.json', '.md')):
                lines.append(f'- `{file}` - [Description]')
        lines.append('')
    
    # Subfolders section
    if folder_info['subfolders']:
        lines.append('## 📁 Subfolders')
        for subfolder in sorted(folder_info['subfolders']):
            lines.append(f'- `{subfolder}/` - [Purpose]')
        lines.append('')
    
    # Constraints section
    lines.append('## ⚠️ Important Constraints')
    lines.append('- [Add important technical constraints or requirements]')
    lines.append('- [Add rate limits, API constraints, etc.]')
    lines.append('')
    
    # Public interfaces section
    lines.append('## 🔌 Public Interfaces')
    lines.append('- `[ClassNameOrFunction]` - [Purpose]')
    lines.append('')
    
    # Integration section
    lines.append('## 🔄 Integration Points')
    lines.append('- **Connected to**: [Other modules this interacts with]')
    lines.append('- **Used by**: [Who consumes this module]')
    lines.append('')
    
    # Common issues section
    lines.append('## 🚨 Common Issues & Fixes')
    lines.append('1. **[Common error]**: [Solution]')
    lines.append('2. **[Performance issue]**: [Optimization]')
    lines.append('')
    
    # Related docs section
    lines.append('## 📚 Related Documentation')
    if parent_info:
        parent_name = parent_info['name']
        lines.append(f'- See `../README.md` for {parent_name} overview')
    
    # Add note about auto-generation
    lines.append('')
    lines.append('---')
    lines.append('*This README was auto-generated. Please update with specific details about this module.*')
    
    return '\n'.join(lines)

def main():
    project_root = Path('/Users/orlandoascanio/Desktop/PersonalOpenClawVersion')
    src_path = project_root / 'src'
    
    if not src_path.exists():
        print(f"Error: {src_path} does not exist")
        return
    
    print(f"Generating README.md files for {src_path}")
    
    # Get all folders in src/
    folders_to_process = []
    for root, dirs, files in os.walk(src_path):
        root_path = Path(root)
        
        # Skip if README already exists
        readme_path = root_path / 'README.md'
        if readme_path.exists():
            print(f"✓ README exists: {root_path.relative_to(project_root)}")
            continue
        
        # Add to processing list
        folders_to_process.append(root_path)
    
    print(f"\nFound {len(folders_to_process)} folders needing README.md files")
    
    # Process each folder
    for folder_path in sorted(folders_to_process, key=lambda p: len(p.parts)):
        folder_info = analyze_folder(folder_path)
        
        # Get parent info if available
        parent_info = None
        if folder_path.parent != src_path and folder_path.parent != project_root:
            parent_readme = folder_path.parent / 'README.md'
            if parent_readme.exists():
                parent_info = {'name': folder_path.parent.name}
        
        # Generate README content
        content = generate_readme_content(folder_info, parent_info)
        
        # Write README.md
        readme_path = folder_path / 'README.md'
        try:
            readme_path.write_text(content, encoding='utf-8')
            print(f"✓ Created: {readme_path.relative_to(project_root)}")
        except Exception as e:
            print(f"✗ Failed to create {readme_path}: {e}")
    
    print(f"\n✅ Done! Created {len(folders_to_process)} README.md files")
    print("\nNext steps:")
    print("1. Review each README.md file")
    print("2. Fill in the [Description] placeholders")
    print("3. Add specific constraints and interfaces")
    print("4. Update line counts and file purposes")

if __name__ == '__main__':
    main()