import React, { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

import { Button } from "../components/Button";
import { HelpTooltip } from "../components/HelpTooltip";
import { EvidenceUploadDialog } from "../components/EvidenceUploadDialog";
import { ChallengeSelectionList } from "../components/ChallengeSelectionList";
import { UserRoute } from "../components/ProtectedRoute";

import { useObligationInstanceList } from "../helpers/obligationInstanceQueries";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/Tabs";
import { EvidenceFilesTab } from "../components/EvidenceFilesTab";
import { EvidenceChallengesTab } from "../components/EvidenceChallengesTab";
import styles from "./evidence-management.module.css";

export default function EvidenceManagementPage() {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isSelectingChallenge, setIsSelectingChallenge] = useState(false);
  const [uploadChallengeId, setUploadChallengeId] = useState<number | undefined>(undefined);
  
  
  const { data: challengesData } = useObligationInstanceList({});

  const handleUploadClick = () => {
    setIsSelectingChallenge(true);
  };

  const handleChallengeSelect = (id: number | undefined) => {
    setUploadChallengeId(id);
    setIsSelectingChallenge(false);
    setIsUploadOpen(true);
  };

  return (
    <UserRoute>
      <div className={styles.container}>
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              Your Proof & Files
              <HelpTooltip 
                title="About Your Files"
                content={
                  <div className="space-y-2">
                    <p>All your files are kept safe and can't be changed. This proves they are real.</p>
                  </div>
                }
              />
            </div>
          }
          subtitle="All the files and proof you've collected for your disputes."
          
        >
          <div className="flex gap-2">
            <Button onClick={handleUploadClick}>
              <Plus size={16} />
              Upload a File
            </Button>
          </div>
        </PageHeader>

        {isSelectingChallenge ? (
          <ChallengeSelectionList 
            challenges={challengesData?.instances || []}
            onSelect={handleChallengeSelect}
            onCancel={() => setIsSelectingChallenge(false)}
          />
        ) : (
          <Tabs defaultValue="files">
            <TabsList>
              <TabsTrigger value="files">All Files</TabsTrigger>
              <TabsTrigger value="challenges">By Challenge</TabsTrigger>
            </TabsList>
            
            <TabsContent value="files" className="mt-6">
              <EvidenceFilesTab />
            </TabsContent>
            
            <TabsContent value="challenges" className="mt-6">
              <EvidenceChallengesTab />
            </TabsContent>
          </Tabs>
        )}

        <EvidenceUploadDialog 
          open={isUploadOpen} 
          onOpenChange={setIsUploadOpen}
          obligationInstanceId={uploadChallengeId}
        />
      </div>
    </UserRoute>
  );
}