const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('src/app/ga');
files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let newContent = content;

    // Fix buttons using bg-[var(--foreground)] with text-white
    newContent = newContent.replace(/bg-\[var\(--foreground\)\] text-\[var\(--background\)\] text-white/g, 'bg-[var(--foreground)] text-[var(--background)]');
    newContent = newContent.replace(/text-white bg-\[var\(--foreground\)\] text-\[var\(--background\)\]/g, 'bg-[var(--foreground)] text-[var(--background)]');
    newContent = newContent.replace(/text-white bg-\[var\(--foreground\)\]/g, 'bg-[var(--foreground)] text-[var(--background)]');
    newContent = newContent.replace(/bg-\[var\(--foreground\)\] text-\[var\(--background\)\](?!\stext-white)(.*?)text-white/g, 'bg-[var(--foreground)] text-[var(--background)]$1'); // remove floating text-white

    // Fix hardcoded inputs
    newContent = newContent.replace(/w-full px-3 py-2 bg-\[var\(--secondary\)\] border border-\[var\(--border\)\] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-\[var\(--ring\)\]/g, 'form-input');
    newContent = newContent.replace(/w-full px-3 py-2 bg-\[var\(--card\)\] border border-\[var\(--border\)\] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-\[var\(--ring\)\]/g, 'form-input');
    newContent = newContent.replace(/w-full px-3 py-2 bg-\[var\(--secondary\)\] border border-\[var\(--border\)\] rounded-lg text-sm/g, 'form-input');
    newContent = newContent.replace(/w-full px-3 py-2 bg-\[var\(--card\)\] border border-\[var\(--border\)\] rounded-lg text-sm/g, 'form-input');

    // Fix ad-hoc colored badges/buttons
    newContent = newContent.replace(/text-indigo-600 bg-indigo-50/g, 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10');
    newContent = newContent.replace(/hover:bg-indigo-100/g, 'hover:bg-indigo-100 dark:hover:bg-indigo-500/20');
    
    newContent = newContent.replace(/bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100/g, 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-500/20');
    newContent = newContent.replace(/bg-blue-50 text-blue-700 border border-blue-200/g, 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20');
    
    newContent = newContent.replace(/bg-emerald-50 border-emerald-100 text-emerald-600/g, 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400');
    newContent = newContent.replace(/bg-amber-50 border-amber-100 text-amber-600/g, 'bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400');
    newContent = newContent.replace(/bg-red-50 text-red-700 border border-red-200 hover:bg-red-100/g, 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/20');
    newContent = newContent.replace(/bg-red-50 border-red-100 text-red-700/g, 'bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20 text-red-700 dark:text-red-400');
    newContent = newContent.replace(/bg-purple-50 border-purple-100 text-purple-600/g, 'bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20 text-purple-600 dark:text-purple-400');

    if (content !== newContent) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log('Updated', file);
    }
});
