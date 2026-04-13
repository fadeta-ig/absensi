import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Starting Master Data Cleanup & Seeding...");

    // Fetch all employees to see what data they hold
    const employees = await prisma.employee.findMany();
    console.log(`Found ${employees.length} employees to analyze.`);

    const uniqueDepts = new Set<string>();
    const uniqueDivs = new Set<string>();
    const uniquePositions = new Set<string>();

    for (const emp of employees) {
        if (emp.department) uniqueDepts.add(emp.department);
        if (emp.division) uniqueDivs.add(emp.division);
        if (emp.position) uniquePositions.add(emp.position);
    }

    // Step 1: Ensure missing Divisions exist
    const defaultDivId = "fake-default"; // fallback if logic fails
    for (const divName of uniqueDivs) {
        const ext = await prisma.division.findUnique({ where: { name: divName } });
        if (!ext) {
            console.log(`[+] Auto-creating missing Division: "${divName}"`);
            await prisma.division.create({ data: { name: divName, isActive: true } });
        }
    }

    // Step 2: Ensure missing Departments exist
    for (const deptName of uniqueDepts) {
        const ext = await prisma.department.findUnique({ where: { name: deptName } });
        if (!ext) {
            console.log(`[+] Auto-creating missing Department: "${deptName}"`);
            // Attempt to assign it to the division matching the employee who holds this department
            const empWhoHoldsIt = employees.find(e => e.department === deptName);
            const divName = empWhoHoldsIt?.division;
            
            let divisionIdToUse = "";
            if (divName) {
                const theDiv = await prisma.division.findUnique({ where: { name: divName } });
                if (theDiv) divisionIdToUse = theDiv.id;
            }

            // Fallback: Pick ANY division if somehow orphaned
            if (!divisionIdToUse) {
                const anyDiv = await prisma.division.findFirst();
                if (anyDiv) divisionIdToUse = anyDiv.id;
            }

            if (!divisionIdToUse) {
                 // Create a fallback division
                 const newDiv = await prisma.division.create({ data: { name: "Umum", isActive: true } });
                 divisionIdToUse = newDiv.id;
            }

            await prisma.department.create({ 
                data: { name: deptName, isActive: true, divisionId: divisionIdToUse } 
            });
        }
    }

    // Step 3: Ensure missing Positions exist
    for (const posName of uniquePositions) {
        const ext = await prisma.position.findUnique({ where: { name: posName } });
        if (!ext) {
            console.log(`[+] Auto-creating missing Position: "${posName}"`);
            // extract level from employee or default STAFF
            const empWhoHoldsIt = employees.find(e => e.position === posName);
            await prisma.position.create({ 
                data: { name: posName, isActive: true, level: empWhoHoldsIt?.level || "STAFF" } 
            });
        }
    }

    console.log("Cleanup and auto-seeding completed gracefully!");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
