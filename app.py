"""Run this module to open the XSD comparison window."""
from pathlib import Path
import queue
import threading
import tkinter as tk
from tkinter import filedialog, ttk
from tkinter.scrolledtext import ScrolledText

from xsd_compare import compare_files


class CompareApp:
    def __init__(self, root):
        self.root = root
        self.paths = ['', '']
        self.busy = False
        self.messages = queue.Queue()
        root.title('XSD File Compare')
        root.geometry('960x640')
        root.minsize(680, 420)
        frame = ttk.Frame(root, padding=20)
        frame.pack(fill='both', expand=True)
        frame.columnconfigure(1, weight=1)
        frame.rowconfigure(5, weight=1)
        ttk.Label(frame, text='Compare two XSD files', font=('Segoe UI', 18, 'bold')).grid(
            row=0, column=0, columnspan=2, sticky='w', pady=(0, 16))
        self.selectors = []
        self.path_labels = []
        for index, label in enumerate(['Select first XSD', 'Select second XSD']):
            button = ttk.Button(frame, text=label, command=lambda i=index: self.select_file(i))
            button.grid(row=index + 1, column=0, sticky='ew', padx=(0, 12), pady=6)
            self.selectors.append(button)
            value = tk.StringVar(value='No file selected')
            self.path_labels.append(value)
            ttk.Entry(frame, textvariable=value, state='readonly').grid(
                row=index + 1, column=1, sticky='ew', pady=6)
        self.compare_button = ttk.Button(frame, text='Compare', command=self.start_comparison, state='disabled')
        self.compare_button.grid(row=3, column=0, sticky='ew', pady=12)
        self.status = tk.StringVar(value='Select two .xsd files to begin.')
        ttk.Label(frame, textvariable=self.status).grid(row=3, column=1, sticky='w')
        ttk.Label(frame, text='Indentation and blank lines are ignored. Spaces inside values remain significant.').grid(
            row=4, column=0, columnspan=2, sticky='w', pady=(0, 8))
        self.results = ScrolledText(frame, wrap='word', font=('Consolas', 10), state='disabled')
        self.results.grid(row=5, column=0, columnspan=2, sticky='nsew')

    def display(self, text):
        self.results.configure(state='normal')
        self.results.delete('1.0', 'end')
        self.results.insert('1.0', text)
        self.results.configure(state='disabled')

    def select_file(self, index):
        path = filedialog.askopenfilename(parent=self.root, title=f'Select XSD file {index + 1}',
                                          filetypes=[('XSD schema files', '*.xsd')])
        if not path:
            return
        self.paths[index] = path
        self.path_labels[index].set(path)
        self.display('')
        self.status.set('Ready to compare.' if all(self.paths) else 'Select the other XSD file.')
        self.compare_button.state(['!disabled'] if all(self.paths) else ['disabled'])

    def start_comparison(self):
        if self.busy or not all(self.paths):
            return
        self.busy = True
        self.compare_button.state(['disabled'])
        for button in self.selectors:
            button.state(['disabled'])
        self.status.set('Comparing…')
        self.display('')
        threading.Thread(target=self.work, args=tuple(self.paths), daemon=True).start()
        self.root.after(50, self.poll)

    def work(self, first, second):
        try:
            differences = compare_files(first, second)
            heading = f'First: {first}\nSecond: {second}\n\n'
            if not differences:
                text = heading + 'Same — no differences under the comparison rules.\nLayout whitespace is ignored.'
                status = 'Same'
            else:
                status = f'{len(differences)} difference(s) found'
                lines = [heading + status, '']
                for number, difference in enumerate(differences, 1):
                    lines.extend([f'{number}. {difference.kind}: {difference.path}',
                                  f'   First:  {difference.first!r}' if difference.first is not None else '   First:  (missing)',
                                  f'   Second: {difference.second!r}' if difference.second is not None else '   Second: (missing)', ''])
                text = '\n'.join(lines)
            self.messages.put((status, text))
        except Exception as error:
            self.messages.put(('Could not compare', f'Could not compare the files.\n\n{error}'))

    def poll(self):
        try:
            status, text = self.messages.get_nowait()
        except queue.Empty:
            self.root.after(50, self.poll)
            return
        self.display(text)
        self.status.set(status)
        self.busy = False
        self.compare_button.state(['!disabled'])
        for button in self.selectors:
            button.state(['!disabled'])


if __name__ == '__main__':
    window = tk.Tk()
    CompareApp(window)
    window.mainloop()
