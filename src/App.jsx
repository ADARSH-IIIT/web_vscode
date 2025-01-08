import React, { useState, useRef, useEffect } from 'react';
import { 
 
  File, 
  Folder, 
  ChevronRight, 
  ChevronDown, 
  Upload, 
  X, 
  Download, 
  Menu,
  FilePlus,
  FolderPlus,
  Undo
} from 'lucide-react';

const STORAGE_KEY = 'vscode_clone_data';
const EXPIRATION_TIME = 24 *  60 * 60 * 1000; // 10 minutes in milliseconds

const App = () => {
  const [files, setFiles] = useState([]);
  const [openFiles, setOpenFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const fileInputRef = useRef(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [actionHistory, setActionHistory] = useState([]);

  // Load data from localStorage on initial render
  useEffect(() => {
    const loadFromStorage = () => {
      const storedData = localStorage.getItem(STORAGE_KEY);
      if (storedData) {
        const { data, timestamp } = JSON.parse(storedData);
        const now = new Date().getTime();
        
        if (now - timestamp < EXPIRATION_TIME) {
          setFiles(data.files);
          setOpenFiles(data.openFiles);
          setActiveFile(data.activeFile);
        } else {
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

  const toggleSidebar = () => {
    setIsTransitioning(true);
    setIsSidebarOpen(!isSidebarOpen);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const clearStorage = () => {
    localStorage.removeItem(STORAGE_KEY);
    setFiles([]);
    setOpenFiles([]);
    setActiveFile(null);
    setSelectedItem(null);
  };

  const downloadCurrentFile = () => {
    if (!activeFile) return;

    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFolder = async () => {
    if (files.length === 0) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    const addFilesToZip = (items, parentPath = '') => {
      items.forEach(item => {
        const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;
        
        if (item.type === 'file') {
          zip.file(itemPath, item.content);
        } else if (item.type === 'folder') {
          addFilesToZip(item.children, itemPath);
        }
      });
    };

    addFilesToZip(files);

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (event) => {
    if (!event.target.files || event.target.files.length === 0) {
      event.target.value = '';
      return;
    }

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
    
    const updatedActiveFile = { ...activeFile, content: newContent };
    setActiveFile(updatedActiveFile);
    
    setOpenFiles(openFiles.map(file => 
      file.id === activeFile.id ? updatedActiveFile : file
    ));
  };

  const addItemToParent = (items, parentId, newItem) => {
    if (!parentId) {
      return [...items, newItem];
    }

    return items.map(item => {
      if (item.id === parentId) {
        return {
          ...item,
          isOpen: true,
          children: [...(item.children || []), newItem]
        };
      }
      if (item.children) {
        return {
          ...item,
          children: addItemToParent(item.children, parentId, newItem)
        };
      }
      return item;
    });
  };

  const handleCreateFile = () => {
    const fileName = prompt("Enter file name:", "new-file.txt");
    if (!fileName) return;

    const newFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: fileName,
      type: 'file',
      content: '',
    };

    const parentId = selectedItem?.type === 'folder' ? selectedItem.id : selectedItem?.parentId;
    const updatedFiles = addItemToParent(files, parentId, newFile);
    setFiles(updatedFiles);
    
    setActionHistory([
      ...actionHistory,
      {
        type: 'create',
        item: newFile,
        parentId
      }
    ]);
  };

  const handleCreateFolder = () => {
    const folderName = prompt("Enter folder name:", "new-folder");
    if (!folderName) return;

    const newFolder = {
      id: Math.random().toString(36).substr(2, 9),
      name: folderName,
      type: 'folder',
      isOpen: true,
      children: [],
    };

    const parentId = selectedItem?.type === 'folder' ? selectedItem.id : selectedItem?.parentId;
    const updatedFiles = addItemToParent(files, parentId, newFolder);
    setFiles(updatedFiles);

    setActionHistory([
      ...actionHistory,
      {
        type: 'create',
        item: newFolder,
        parentId
      }
    ]);
  };

  const removeItemFromTree = (items, itemId) => {
    return items.filter(item => {
      if (item.id === itemId) {
        return false;
      }
      if (item.children) {
        item.children = removeItemFromTree(item.children, itemId);
      }
      return true;
    });
  };

  const handleUndo = () => {
    if (actionHistory.length === 0) return;

    const lastAction = actionHistory[actionHistory.length - 1];
    let updatedFiles = [...files];

    if (lastAction.type === 'create') {
      updatedFiles = removeItemFromTree(updatedFiles, lastAction.item.id);
      
      if (activeFile?.id === lastAction.item.id) {
        setActiveFile(null);
      }
      if (selectedItem?.id === lastAction.item.id) {
        setSelectedItem(null);
      }
      setOpenFiles(openFiles.filter(f => f.id !== lastAction.item.id));
    }

    setFiles(updatedFiles);
    setActionHistory(actionHistory.slice(0, -1));
  };

  const FileTreeItem = ({ item, depth = 0, parentId = null }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(item.name);
    const inputRef = useRef(null);

    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

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

    const handleNameSubmit = () => {
      if (editName.trim()) {
        const updateFilename = (files) =>
          files.map((f) => {
            if (f.id === item.id) {
              return { ...f, name: editName.trim() };
            }
            if (f.children) {
              return { ...f, children: updateFilename(f.children) };
            }
            return f;
          });

        setFiles(updateFilename(files));
        
        if (item.type === 'file') {
          setOpenFiles(openFiles.map(f => 
            f.id === item.id ? { ...f, name: editName.trim() } : f
          ));
          if (activeFile?.id === item.id) {
            setActiveFile({ ...activeFile, name: editName.trim() });
          }
        }
      }
      setIsEditing(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        handleNameSubmit();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setEditName(item.name);
      }
    };

    const handleClick = (e) => {
      e.stopPropagation();
      if (!isEditing) {
        setSelectedItem({ ...item, parentId });
        if (item.type === 'file') {
          openFileInTab(item);
        }
      }
    };

    return (
      <div    >
        <div
          className={`flex items-center p-1 hover:bg-gray-700 cursor-pointer ${
            selectedItem?.id === item.id ? 'bg-gray-700' : ''
          }`}
          style={{ paddingLeft: `${depth * 16}px` }}
          onClick={handleClick}
          onDoubleClick={() => {
            if (!isEditing) {
              if (item.type === 'folder') {
                toggleFolder(item);
              } else {
                setIsEditing(true);
              }
            }
          }}
        >
          {item.type === 'folder' && (
            <span onClick={(e) => {
              e.stopPropagation();
              toggleFolder(item);
            }}>
              {item.isOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          )}
          {item.type === 'folder' ? (
            <Folder className="w-4 h-4 mx-1" />
          ) : (
            <File className="w-4 h-4 mx-1" />
          )}
          {isEditing ? (
            <input
              ref={inputRef}
              className="bg-gray-800 text-white text-sm outline-none px-1 w-40"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="ml-1 text-sm">{item.name}</span>
          )}
        </div>
        {item.type === 'folder' && item.isOpen && (
          <div>
            {item.children.map((child) => (
              <FileTreeItem 
                key={child.id}
                item={child} 
                depth={depth + 1}
                parentId={item.id}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const ExplorerHeader = () => (
    <div className="p-2 text-sm font-semibold flex-shrink-0 flex items-center justify-between">
      <span>EXPLORER</span>
      <div className="flex items-center gap-2">
        <FilePlus
          className="w-4 h-4 cursor-pointer hover:text-blue-400"
          onClick={handleCreateFile}
        />
        <FolderPlus
          className="w-4 h-4 cursor-pointer hover:text-blue-400"
          onClick={handleCreateFolder}
        />
        <Undo
          className={`w-4 h-4 cursor-pointer ${
            actionHistory.length > 0 
              ? 'hover:text-blue-400' 
              : 'text-gray-600 cursor-not-allowed'
          }`}
          onClick={handleUndo}
        />
      </div>
    </div>
  );

  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    fileInputRef.current?.click();
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Title Bar */}
      <div className="h-10 flex-shrink-0 bg-gray-800 flex items-center px-4 justify-between">
        <div className="flex items-center gap-2 ">
          <button
            onClick={toggleSidebar}
            className="p-0 hover:bg-gray-700 rounded"
          >
            <Menu className="w-4 h-4  bg-gray-700" />
          </button>
        </div>
        <div className="flex  items-center gap-2">
        
          <button
            onClick={downloadCurrentFile}
            disabled={!activeFile}
            className={`flex items-center px-2 py-1 text-sm rounded ${
              activeFile 
                ? 'bg-yellow-500 hover:bg-yellow-600' 
                : 'bg-gray-800 cursor-not-allowed text-gray-500'
            }`}
          >
            <Download className="w-4 h-4 mr-1" />
            Download Selected File
          </button>
          <button
            onClick={downloadFolder}
            disabled={files.length === 0}
            className={`flex items-center px-2 py-1 text-sm rounded ${
              files.length > 0 
                ? 'bg-green-500 hover:bg-green-700' 
                : 'bg-gray-800 cursor-not-allowed text-gray-500'
            }`}
          >
            <Download className="w-4 h-4 mr-1" />
            Download Complete folder
          </button>

          <button
            onClick={handleUploadClick}
            className="flex items-center px-2 py-1 text-sm bg-red-500 rounded hover:bg-red-700"
          >
            <Upload className="w-4 h-4 mr-1  " />
            Upload New Folder
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
        {/* Sidebar with transition */}
        <div
          className={`bg-gray-800 flex-shrink-0 border-r border-gray-700 flex flex-col transition-all duration-300 ease-in-out ${
            isTransitioning ? 'transition-gpu' : ''
          }`}
          style={{ 
            width: isSidebarOpen ? `${sidebarWidth}px` : '0',
            opacity: isSidebarOpen ? 1 : 0
          }}
        >
          <ExplorerHeader />
          <div className="overflow-y-auto flex-1">
            {files.map((file) => (
              <FileTreeItem 
                key={file.id} 
                item={file}
                parentId={null}
              />
            ))}
            {files.length === 0 && (
              <div className="p-4 text-sm text-gray-500 text-center">
                No files uploaded yet
              </div>
            )}
          </div>
        </div>

        {/* Resize Handle */}
        {isSidebarOpen && (
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
        )}

        {/* Editor Area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {activeFile ? (
            <div className="h-full flex flex-col">
              <div className="px-4 py-2 text-sm text-gray-400 bg-gray-800 border-b border-gray-700 flex-shrink-0">
                {activeFile.name}
              </div>
              <div className="flex-1 p-4 overflow-hidden">
                <textarea
                  key={activeFile.id}
                  className="w-full h-full bg-gray-900 text-white font-mono outline-none resize-none p-2 overflow-y-auto"
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