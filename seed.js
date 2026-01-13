const clearDatabase = async () => {
    try {
        const result = await GroceryItem.deleteMany({});
        console.log('Cleared ${result.deletedCount} items from the database.');
    } catch (err) {
        console.error("Error clearing database:", err);
    }
};