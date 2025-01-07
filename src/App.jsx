import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, File, Folder, ChevronRight, ChevronDown, Upload, X } from 'lucide-react';

const STORAGE_KEY = 'vscode_clone_data';
const EXPIRATION_TIME = 10 * 60 * 1000; // 10 minutes in milliseconds

const App = () => {
  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const fileInputRef = useRef(null);

  // Load data from localStorage on initial render
  useEffect(() => {
    const loadFromStorage = () => {
      const storedData = localStorage.getItem(STORAGE_KEY);
      if (storedData) {
        const { data, timestamp } = JSON.parse(storedData);
        const now = new Date().getTime();
        
        // Check if data hasn't expired
        if (now - timestamp < EXPIRATION_TIME) {
          setFiles(data.files);
          setOpenFiles(data.openFiles);
          setActiveFile(data.activeFile);
        } else {
          // Clear expired data
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    };

    loadFromStorage();
  }, []);

  // Save data to localStorage whenever files, openFiles, or activeFile changes
  useEffect(() => {
    const saveToStorage = () => {
      const data = {
        files,
        openFiles,
        activeFile
      };
      
      const storageData = {
        data,
        timestamp: new Date().getTime()
      };
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
    };

    if (files.length > 0) {
      saveToStorage();
    }
  }, [files, openFiles, activeFile]);

  const clearStorage = () => {
    localStorage.removeItem(STORAGE_KEY);
    setFiles([]);
    setOpenFiles([]);
    setActiveFile(null);
  };

  const handleFileUpload = async (event) => {
    if (!event.target.files || event.target.files.length === 0) {
      event.target.value = '';
      return;
    }

    // Clear existing data before uploading new folder
    clearStorage();

    const items = event.target.files;

    const processFiles = async (items) => {
      const fileStructure = [];

      for (let item of items) {
        const path = item.webkitRelativePath || item.name;
        const parts = path.split('/');

        let currentLevel = fileStructure;
        let currentPath = '';

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          currentPath += (i > 0 ? '/' : '') + part;

          if (i === parts.length - 1) {
            const content = await readFileContent(item);
            currentLevel.push({
              name: part,
              type: 'file',
              content: content,
              path: currentPath,
              id: Math.random().toString(36).substr(2, 9),
            });
          } else {
            let folder = currentLevel.find(
              (f) => f.name === part && f.type === 'folder'
            );
            if (!folder) {
              folder = {
                name: part,
                type: 'folder',
                isOpen: false,
                children: [],
                path: currentPath,
                id: Math.random().toString(36).substr(2, 9),
              };
              currentLevel.push(folder);
            }
            currentLevel = folder.children;
          }
        }
      }

      return fileStructure;
    };

    const readFileContent = (file) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsText(file);
      });
    };

    const newFiles = await processFiles(items);
    setFiles(newFiles);
    event.target.value = '';
  };

  const openFileInTab = (file) => {
    if (!openFiles.find((f) => f.id === file.id)) {
      setOpenFiles([...openFiles, file]);
    }
    setActiveFile(file);
  };

  const closeFileTab = (file) => {
    const remainingFiles = openFiles.filter((f) => f.id !== file.id);
    setOpenFiles(remainingFiles);
    if (activeFile?.id === file.id) {
      setActiveFile(remainingFiles.length > 0 ? remainingFiles[0] : null);
    }
  };

  const updateFileContent = (newContent) => {
    const updateFilesRecursive = (filesArray) => {
      return filesArray.map((file) => {
        if (file.id === activeFile.id) {
          return { ...file, content: newContent };
        }
        if (file.children) {
          return {
            ...file,
            children: updateFilesRecursive(file.children),
          };
        }
        return file;
      });
    };

    const updatedFiles = updateFilesRecursive(files);
    setFiles(updatedFiles);
    
    // Update the active file in both state and openFiles
    const updatedActiveFile = { ...activeFile, content: newContent };
    setActiveFile(updatedActiveFile);
    
    setOpenFiles(openFiles.map(file => 
      file.id === activeFile.id ? updatedActiveFile : file
    ));
  };

  const FileTreeItem = ({ item, depth = 0 }) => {
    const toggleFolder = (item) => {
      const updateFiles = (files) =>
        files.map((f) => {
          if (f.id === item.id) {
            return { ...f, isOpen: !f.isOpen };
          }
          if (f.children) {
            return { ...f, children: updateFiles(f.children) };
          }
          return f;
        });

      setFiles(updateFiles(files));
    };

    return (
      <div>
        <div
          className={`flex items-center p-1 hover:bg-gray-700 cursor-pointer ${
            activeFile?.id === item.id ? 'bg-gray-700' : ''
          }`}
          style={{ paddingLeft: `${depth * 16}px` }}
          onClick={() => {
            if (item.type === 'file') {
              openFileInTab(item);
            } else {
              toggleFolder(item);
            }
          }}
        >
          {item.type === 'folder' &&
            (item.isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            ))}
          {item.type === 'folder' ? (
            <Folder className="w-4 h-4 mx-1" />
          ) : (
            <File className="w-4 h-4 mx-1" />
          )}
          <span className="ml-1 text-sm">{item.name}</span>
        </div>
        {item.type === 'folder' && item.isOpen && (
          <div>
            {item.children.map((child) => (
              <FileTreeItem key={child.id} item={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Title Bar */}
      <div className="h-8 flex-shrink-0 bg-gray-800 flex items-center px-4 justify-between">
        <div className="flex items-center">
          <BookOpen className="w-4 h-4 mr-2" />
          <span className="text-sm">VSCode Clone</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUploadClick}
            className="flex items-center px-2 py-1 text-sm bg-gray-700 rounded hover:bg-gray-600"
          >
            <Upload className="w-4 h-4 mr-1" />
            Upload Folder
          </button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={handleFileUpload}
        />
      </div>

      {/* Tabs for Open Files */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 flex items-center">
        {openFiles.map((file) => (
          <div
            key={file.id}
            className={`flex items-center px-4 py-2 text-sm cursor-pointer hover:bg-gray-700 ${
              activeFile?.id === file.id ? 'bg-gray-700' : ''
            }`}
            onClick={() => setActiveFile(file)}
          >
            <span>{file.name}</span>
            <X
              className="w-4 h-4 ml-2 hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                closeFileTab(file);
              }}
            />
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 w-full overflow-hidden">
        {/* Sidebar */}
        <div
          className="bg-gray-800 flex-shrink-0 border-r border-gray-700 flex flex-col"
          style={{ width: sidebarWidth }}
        >
          <div className="p-2 text-sm font-semibold flex-shrink-0">EXPLORER</div>
          <div className="overflow-y-auto flex-1">
            {files.map((file) => (
              <FileTreeItem key={file.id} item={file} />
            ))}
            {files.length === 0 && (
              <div className="p-4 text-sm text-gray-500 text-center">
                No files uploaded yet
              </div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 flex-shrink-0"
          onMouseDown={(e) => {
            const startX = e.clientX;
            const startWidth = sidebarWidth;

            const onMouseMove = (e) => {
              const newWidth = startWidth + (e.clientX - startX);
              setSidebarWidth(Math.max(100, newWidth));
            };

            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        />

        {/* Editor */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeFile ? (
            <div className="h-full flex flex-col ">
              <div className="px-4 py-2 text-sm text-gray-400 bg-gray-800 border-b border-gray-700 flex-shrink-0">
                {activeFile.name}
              </div>
              <div className="flex-1 p-4 overflow-hidden">
                <textarea
                  key={activeFile.id}
                  className="w-full h-full  bg-gray-900 text-white font-mono outline-none resize-none p-2 overflow-y-auto"
                  value={activeFile.content}
                  onChange={(e) => updateFileContent(e.target.value)}
                  spellCheck="false" 
                  
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              Select a file to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;