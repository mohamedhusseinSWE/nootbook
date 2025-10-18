import MaxWidthWrapper from "@/components/MaxWidthWrapper";
import PricingSection from "@/components/PricingSection";
import FAQSection, { pricingFAQs } from "@/components/FAQSection";

const Page = () => {
  return (
    <MaxWidthWrapper className="mb-8 mt-24 text-center max-w-6xl">
      <div className="mx-auto mb-10 sm:max-w-lg">
        <h1 className="text-6xl font-bold sm:text-7xl">Pricing</h1>
        <p className="mt-5 text-gray-600 sm:text-lg">
          Whether you&apos;re just trying out our service or need more,
          we&apos;ve got you covered.
        </p>
      </div>

      <PricingSection 
        showTitle={false}
        showBillingTabs={true}
        defaultBillingCycle="monthly"
      />

      <FAQSection 
        faqs={pricingFAQs} 
        title="Pricing FAQs"
        description="Common questions about our pricing plans and billing"
      />
    </MaxWidthWrapper>
  );
};

export default Page;
