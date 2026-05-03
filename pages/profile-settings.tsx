import { ArrowRight } from "lucide-react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useUserProfile } from "../helpers/useUserProfile";
import { useToast } from "../helpers/useToast";
import { PageHeader } from "../components/PageHeader";

import { Skeleton } from "../components/Skeleton";

import { ProfileForm, ProfileFormValues } from "../components/ProfileForm";
import { SubscriptionSection } from "../components/SubscriptionSection";
import styles from "./profile-settings.module.css";

export default function ProfileSettingsPage() {
  const { profile, isLoading, updateProfile, isUpdating } = useUserProfile();
  
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showSuccess } = useToast();

  const returnTo = searchParams.get("returnTo");
  const returnTradelineId = searchParams.get("tradelineId");
  const returnBureauId = searchParams.get("bureauId");
  const returnViolationId = searchParams.get("violationId");
  
  const missingFieldsParam = searchParams.get("missingFields");
  const missingFields = missingFieldsParam ? missingFieldsParam.split(",") : [];

  const fieldLabels: Record<string, string> = {
    fullName: "Full Name",
    addressLine1: "Address",
    city: "City",
    province: "Province",
    postalCode: "Postal Code",
    dateOfBirth: "Date of Birth",
    phoneNumber: "Phone Number",
  };

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await updateProfile(values);
      
      if (returnTo === "createPacket" && returnTradelineId) {
        showSuccess("Profile updated successfully", {
          description: "You can now proceed with creating your dispute packet.",
          duration: 8000,
          action: {
            label: "Write Letter Now",
            onClick: () => {
              const params = new URLSearchParams();
              params.set("tab", "compliance");
              params.set("openCreatePacket", "true");
              if (returnBureauId) params.set("bureauId", returnBureauId);
              if (returnViolationId) params.set("violationId", returnViolationId);
              
              navigate(`/tradelines/${returnTradelineId}?${params.toString()}`);
            }
          }
        });
      } else if (returnTo && returnTo !== "createPacket") {
        showSuccess("Profile updated!", {
          description: "Taking you back...",
        });
        navigate(returnTo);
      }
    } catch (error) {
      console.error("Failed to update profile", error);
      // Error toast is handled by the hook
    }
  };

  if (isLoading || !profile) {
    return (
      <div className={styles.container}>
        <PageHeader
          title="Your Info"
          subtitle="Make sure your info is right so your dispute letters are correct"
          
        />
        <div className={styles.loadingContainer}>
          <Skeleton className={styles.skeletonInput} />
          <Skeleton className={styles.skeletonInput} />
          <div className={styles.skeletonRow}>
            <Skeleton className={styles.skeletonInput} />
            <Skeleton className={styles.skeletonInput} />
          </div>
          <Skeleton className={styles.skeletonButton} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <PageHeader
        title="Your Info"
        subtitle="Make sure your info is right so your dispute letters are correct"
        
      />

      <div className={styles.content}>
        {returnTo === "createPacket" && (
          <div className={styles.returnBanner}>
            <div className={styles.returnBannerContent}>
              <ArrowRight size={20} className={styles.returnIcon} />
              <div>
                <h4>We Need More Info</h4>
                <p>Please fill in the fields below before you can write your dispute letter.</p>
                {missingFields.length > 0 && (
                  <div className={styles.missingFieldsList}>
                    <strong>Missing fields:</strong>{" "}
                    {missingFields
                      .map((f) => fieldLabels[f] || f)
                      .join(", ")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <SubscriptionSection />

        <div className={styles.infoBox}>
          <p>
            <strong>Important:</strong> This info goes into your dispute letters. Make sure it matches your ID and where you live right now.
          </p>
        </div>

        <ProfileForm 
          initialData={profile}
          isUpdating={isUpdating}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}