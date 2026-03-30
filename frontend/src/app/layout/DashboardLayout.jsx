import { useState } from "react";
import Navbar from "../../components/navbar/Navbar";
import Sidebar from "../../components/sidebar/Sidebar";
import { Toaster } from "react-hot-toast";

export default function DashboardLayout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="bg-purple-100 min-h-screen">
      <Navbar onMenuToggle={toggleSidebar} />
      <Toaster position="top-right" />

      <div className="flex pt-15">
        <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

        <div className="flex-1 flex flex-col min-h-[calc(100vh-80px)]">
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
          <footer className="px-4 md:px-6 lg:px-8 py-4 border-t border-gray-200 bg-white">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <img
                src="SoftTechz_logo_and_name.png"
                alt="SoftTechz Logo"
                className="h-6 object-contain"
              />
              <span>
                © {new Date().getFullYear()} SoftTechz. All rights reserved.
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
