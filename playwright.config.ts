import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/e2e',timeout:90000,workers:1,use:{baseURL:'http://localhost:5173',channel:'chrome',viewport:{width:1440,height:1000},headless:true},webServer:{command:'npm run dev',url:'http://localhost:5173',reuseExistingServer:true,timeout:30000}});
