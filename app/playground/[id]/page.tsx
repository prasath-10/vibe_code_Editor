"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import LoadingStep from "@/modules/playground/components/loader";
import { PlaygroundEditor } from "@/modules/playground/components/playground-editor";
import { TemplateFileTree } from "@/modules/playground/components/playground-explorer";

import { useAISuggestions } from "@/modules/playground/hooks/useAISuggestion";
import { useFileExplorer } from "@/modules/playground/hooks/useFileExplorer";
import { usePlayground } from "@/modules/playground/hooks/usePlayground";

import { findFilePath } from "@/modules/playground/lib";
import { TemplateFolder } from "@/modules/playground/lib/path-to-json";

import WebContainerPreview from "@/modules/webcontainers/components/webcontainer-preview";
import { useWebContainer } from "@/modules/webcontainers/hooks/useWebContainer";

import { FileText, Save } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

const MainPlaygroundPage = () => {
  const { id } = useParams<{ id: string }>();

  const { playgroundData, templateData, isLoading, error, saveTemplateData } =
    usePlayground(id);

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

  const aiSuggestions = useAISuggestions();

  // 🔥 SAFE TYPE FIX
  const {
    serverUrl,
    isLoading: containerLoading,
    error: containerError,
    instance,
    writeFileSync,
  } = useWebContainer({
    templateData: templateData as TemplateFolder,
  });

  const lastSyncedContent = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (id) setPlaygroundId(id);
  }, [id, setPlaygroundId]);

  useEffect(() => {
    if (templateData && !openFiles.length) {
      setTemplateData(templateData);
    }
  }, [templateData, setTemplateData, openFiles.length]);

  const activeFile = openFiles.find((file) => file.id === activeFileId);
  const hasUnsavedChanges = openFiles.some((f) => f.hasUnsavedChanges);

  const handleSave = useCallback(
    async (fileId?: string) => {
      const targetFileId = fileId || activeFileId;
      if (!targetFileId) return;

      const fileToSave = openFiles.find((f) => f.id === targetFileId);
      if (!fileToSave) return;

      const latestTemplateData = useFileExplorer.getState().templateData;
      if (!latestTemplateData) return;

      try {
        const filePath = findFilePath(fileToSave, latestTemplateData);
        if (!filePath) {
          toast.error("File path not found");
          return;
        }

        const updatedTemplateData = JSON.parse(
          JSON.stringify(latestTemplateData)
        );

        const updateRecursive = (items: any[]): any[] =>
          items.map((item) => {
            if ("folderName" in item) {
              return {
                ...item,
                items: updateRecursive(item.items),
              };
            }

            if (
              item.filename === fileToSave.filename &&
              item.fileExtension === fileToSave.fileExtension
            ) {
              return { ...item, content: fileToSave.content };
            }

            return item;
          });

        updatedTemplateData.items = updateRecursive(
          updatedTemplateData.items
        );

        if (writeFileSync) {
          await writeFileSync(filePath, fileToSave.content);
          lastSyncedContent.current.set(
            fileToSave.id,
            fileToSave.content
          );

          if (instance?.fs) {
            await instance.fs.writeFile(filePath, fileToSave.content);
          }
        }

        // 🔥 IMPORTANT FIX
        await saveTemplateData(updatedTemplateData);

        // Always set local data
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

  // =============================
  // STATES
  // =============================

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <LoadingStep currentStep={1} step={1} label="Loading Playground" />
      </div>
    );
  }

  if (!templateData) {
    return <div>No template data available</div>;
  }

  return (
    <TooltipProvider>
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
                {playgroundData?.title || "Code Playground"}
              </h1>

              <Button
                size="sm"
                variant="outline"
                onClick={() => handleSave()}
                disabled={!activeFile || !hasUnsavedChanges}
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
                  aiSuggestions.acceptSuggestion(editor, monaco)
                }
                onRejectSuggestion={(editor) =>
                  aiSuggestions.rejectSuggestion(editor)
                }
                onTriggerSuggestion={(type, editor) =>
                  aiSuggestions.fetchSuggestion(type, editor)
                }
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <FileText className="h-12 w-12 text-gray-300" />
              </div>
            )}
          </div>

          {serverUrl && (
            <WebContainerPreview
              templateData={templateData}
              instance={instance}
              writeFileSync={writeFileSync}
              isLoading={containerLoading}
              error={containerError}
              serverUrl={serverUrl}
              forceResetup={false}
            />
          )}
        </SidebarInset>
      </div>
    </TooltipProvider>
  );
};

export default MainPlaygroundPage;
