"use client";

import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

import LoadingStep from "@/modules/playground/components/loader";
import { PlaygroundEditor } from "@/modules/playground/components/playground-editor";
import { TemplateFileTree } from "@/modules/playground/components/playground-explorer";

import { useAISuggestions } from "@/modules/playground/hooks/useAISuggestion";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { usePlayground } from "@/modules/playground/hooks/usePlayground";

import { findFilePath } from "@/modules/playground/lib";
import WebContainerPreview from "@/modules/webcontainers/components/webcontainer-preview";
import { useWebContainer } from "@/modules/webcontainers/hooks/useWebContainer";

import {
  AlertCircle,
  FileText,
  FolderOpen,
  Save,
} from "lucide-react";

import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const MainPlaygroundPage = () => {
  const { id } = useParams<{ id: string }>();
  const [isPreviewVisible] = useState(true);

  const { playgroundData, templateData, isLoading, error, saveTemplateData } =
    usePlayground(id);

  const aiSuggestions = useAISuggestions();

  const {
    setTemplateData,
    setActiveFileId,
    setPlaygroundId,
    setOpenFiles,
    activeFileId,
    openFile,
    openFiles,
    updateFileContent,
  } = useFileExplorer();

  // ✅ FIX 1: null-safe templateData
  const {
    serverUrl,
    isLoading: containerLoading,
    error: containerError,
    instance,
    writeFileSync,
  } = useWebContainer({ templateData: templateData ?? undefined });

  const lastSyncedContent = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (id) {
      setPlaygroundId(id);
    }
  }, [id, setPlaygroundId]);

  useEffect(() => {
    if (templateData && !openFiles.length) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData, openFiles.length]);

  const activeFile = openFiles.find((file) => file.id === activeFileId);
  const hasUnsavedChanges = openFiles.some(
    (file) => file.hasUnsavedChanges
  );

  // ✅ FULLY FIXED SAVE FUNCTION
  const handleSave = useCallback(
    async (fileId?: string) => {
      const targetFileId = fileId || activeFileId;
      if (!targetFileId) return;

      const fileToSave = openFiles.find(
        (f) => f.id === targetFileId
      );
      if (!fileToSave) return;

      const latestTemplateData =
        useFileExplorer.getState().templateData;
      if (!latestTemplateData) return;

      try {
        const filePath = findFilePath(
          fileToSave,
          latestTemplateData
        );
        if (!filePath) {
          toast.error("File path not found");
          return;
        }

        const updatedTemplateData = JSON.parse(
          JSON.stringify(latestTemplateData)
        );

        const updateFileRecursive = (items: any[]): any[] =>
          items.map((item) => {
            if ("folderName" in item) {
              return {
                ...item,
                items: updateFileRecursive(item.items),
              };
            }

            if (
              item.filename === fileToSave.filename &&
              item.fileExtension ===
                fileToSave.fileExtension
            ) {
              return {
                ...item,
                content: fileToSave.content,
              };
            }

            return item;
          });

        updatedTemplateData.items = updateFileRecursive(
          updatedTemplateData.items
        );

        // Sync to WebContainer
        if (writeFileSync && filePath) {
          await writeFileSync(filePath, fileToSave.content);
          lastSyncedContent.current.set(
            fileToSave.id,
            fileToSave.content
          );

          if (instance?.fs) {
            await instance.fs.writeFile(
              filePath,
              fileToSave.content
            );
          }
        }

        // ✅ FIX 2: DO NOT CHECK RETURN VALUE (it returns void)
        await saveTemplateData(updatedTemplateData);
        setTemplateData(updatedTemplateData);

        const updatedOpenFiles = openFiles.map((f) =>
          f.id === targetFileId
            ? {
                ...f,
                content: fileToSave.content,
                originalContent: fileToSave.content,
                hasUnsavedChanges: false,
              }
            : f
        );

        setOpenFiles(updatedOpenFiles);

        toast.success(
          `Saved ${fileToSave.filename}.${fileToSave.fileExtension}`
        );
      } catch (err) {
        console.error(err);
        toast.error("Failed to save file");
      }
    },
    [
      activeFileId,
      openFiles,
      writeFileSync,
      instance,
      saveTemplateData,
      setTemplateData,
      setOpenFiles,
    ]
  );

  // ------------------------
  // ERROR STATE
  // ------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // ------------------------
  // LOADING STATE
  // ------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingStep
          currentStep={1}
          step={1}
          label="Loading Playground..."
        />
      </div>
    );
  }

  // ------------------------
  // NO TEMPLATE
  // ------------------------

  if (!templateData) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <FolderOpen className="h-12 w-12 text-yellow-500 mb-4" />
        <p>No template data available</p>
      </div>
    );
  }

  // ------------------------
  // MAIN UI
  // ------------------------

  return (
    <div className="h-screen flex">
      <TemplateFileTree
        data={templateData}
        onFileSelect={openFile}
        selectedFile={activeFile}
        title="File Explorer"
      />

      <SidebarInset>
        <header className="flex h-16 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />

          <div className="flex flex-1 justify-between items-center">
            <h1 className="text-sm font-medium">
              {playgroundData?.title ||
                "Code Playground"}
            </h1>

            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSave()}
              disabled={
                !activeFile ||
                !activeFile.hasUnsavedChanges
              }
            >
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1">
          {activeFile ? (
            <PlaygroundEditor
              activeFile={activeFile}
              content={activeFile.content}
              onContentChange={(value) =>
                activeFileId &&
                updateFileContent(activeFileId, value)
              }
              suggestion={aiSuggestions.suggestion}
              suggestionLoading={aiSuggestions.isLoading}
              suggestionPosition={aiSuggestions.position}
              onAcceptSuggestion={(editor, monaco) =>
                aiSuggestions.acceptSuggestion(
                  editor,
                  monaco
                )
              }
              onRejectSuggestion={(editor) =>
                aiSuggestions.rejectSuggestion(editor)
              }
              onTriggerSuggestion={(type, editor) =>
                aiSuggestions.fetchSuggestion(
                  type,
                  editor
                )
              }
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <FileText className="h-12 w-12 text-gray-300" />
            </div>
          )}
        </div>
      </SidebarInset>
    </div>
  );
};

export default MainPlaygroundPage;
