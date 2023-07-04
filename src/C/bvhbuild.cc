#include<stdlib.h>
#include<iostream>
#include <emscripten.h>

struct vec3 {
    float x;
    float y;
    float z;
};

struct Triangle {
    struct vec3 v0; 
    struct vec3 v1; 
    struct vec3 v2;
    struct vec3 centroid;
};
//basically a "pointer" to a triangle
typedef unsigned int uint;
typedef uint Tri;

//node for intermediate BVH construction - not the final packed version
struct iBVHNode {
    struct vec3 AABBMin;
    struct vec3 AABBMax;
    uint leftChild;
    uint rightChild;
    uint isleaf;
    uint firstPrim;
    uint primCount;
};
//BVH node once it is flattened, assuming it is an internal node
struct PackedBVHBranch {
    float AABBLLowX;
    float AABBLLowY;
    float AABBLLowZ;
    uint rightPtr;
    float AABBLHighX;
    float AABBLHighY;
    float AABBLHighZ;
    uint padding0;  //should be set to 0u to signal an object
    float AABBRLowX;
    float AABBRLowY;
    float AABBRLowZ;
    uint padding1;
    float AABBRHighX;
    float AABBRHighY;
    float AABBRHighZ;
    uint padding2;
};
//BVH node once it is flattened, assuming it is a leaf that points to an array of primitives
struct PackedBVHLeaf {
    uint primitiveStart;
    uint primitiveEnd;
    uint padding0;
    uint ptr; //Should be set to 0u to signal a leaf node
    uint padding1;
    uint padding2;
    uint padding3;
    uint padding4;//should be set to 0u to signal an object
    uint padding5;
    uint padding6;
    uint padding7;
    uint padding8;
    uint padding9;
    uint padding10;
    uint padding11;
    uint padding12;
};
//allows significantly faster swapping/duplication
struct TriangleArray {
    int numTris;
    struct Triangle* trianglePool;
    Tri* triangles;
};
//this is a triangle when being sent out, 64 bytes
struct PackedTriangle {
    float v0x;
    float v0y;
    float v0z;
    uint padding0;
    float v1x;
    float v1y;
    float v1z;
    uint padding1;
    float v2x;
    float v2y;
    float v2z;
    uint padding2;
    float xtra0;
    float xtra1;
    float xtra2;
    uint padding3;
};
//wraps up multiple pieces of data into one
struct BVH {
    struct PackedTriangle* triangles;
    struct iBVHNode* nodes;
    uint rootIdx;
    uint nodesUsed;
};

float min(float a, float b);
float max(float a, float b);
struct vec3 addVec3(struct vec3 x, struct vec3 y);
struct vec3 subVec3(struct vec3 a, struct vec3 b);
struct vec3 multVec3(struct vec3 x, float a);
struct vec3 ftoVec3(float a);
struct vec3 minVec3(struct vec3 a, struct vec3 b);
struct vec3 maxVec3(struct vec3 a, struct vec3 b);

struct TriangleArray genTriArray(float* inTris, int numTris);
struct BVH BuildiBVH(struct TriangleArray* tris);
void UpdateNodeBounds(struct iBVHNode* bvh, struct TriangleArray* tris, uint index);
void SubdivideNode(struct BVH* bvh, struct TriangleArray* tris, uint index);
uint addINodeToPacked(struct BVH* bvh, void* outBVH, uint iIndex, int* openPtr);

extern "C" {
//returns an integer that is the size of the outgoing bvh in wasm memory
EMSCRIPTEN_KEEPALIVE
int bvhbuild(int numTriangles, float* inTriangles) {
    //printf("here0\n");
    struct TriangleArray triangleArray = genTriArray(inTriangles, numTriangles);
    //printf("here1\n");
    struct BVH bvh = BuildiBVH(&triangleArray);
    //printf("here2\n");

    //pack intermediate bvh into our format
    void* outBVH = malloc(sizeof(struct PackedBVHBranch) * bvh.nodesUsed);
    int openPtr = 0;

    addINodeToPacked(&bvh, outBVH, bvh.rootIdx, &openPtr);

    //now write the location/size of the two buffers to memory for JS to read
    //just write to beginning of the file
    int* outValues = (int*) inTriangles;
    outValues[0] = bvh.nodesUsed;
    outValues[1] = (int) outBVH;
    outValues[2] = triangleArray.numTris;
    outValues[3] = (int) bvh.triangles;

    return 0;
}
}

//adds an intermediate BVH node to our packed format
uint addINodeToPacked(struct BVH* bvh, void* outBVH, uint iIndex, int* openPtr) {
    struct iBVHNode* cur = &bvh->nodes[iIndex];
    //this is an internal node
    if (cur->primCount == 0) {
        struct iBVHNode* left = &bvh->nodes[cur->leftChild];
        struct iBVHNode* right = &bvh->nodes[cur->rightChild];

        struct PackedBVHBranch* curOut = &(((struct PackedBVHBranch*) outBVH)[*openPtr]);
        int idx = *openPtr;
        *openPtr += 1;

        curOut->AABBLLowX = left->AABBMin.x;
        curOut->AABBLLowY = left->AABBMin.y;
        curOut->AABBLLowZ = left->AABBMin.z;
        curOut->AABBLHighX = left->AABBMax.x;
        curOut->AABBLHighY = left->AABBMax.y;
        curOut->AABBLHighZ = left->AABBMax.z;

        curOut->AABBRLowX = right->AABBMin.x;
        curOut->AABBRLowY = right->AABBMin.y;
        curOut->AABBRLowZ = right->AABBMin.z;
        curOut->AABBRHighX = right->AABBMax.x;
        curOut->AABBRHighY = right->AABBMax.y;
        curOut->AABBRHighZ = right->AABBMax.z;

        curOut->padding0 = 123456789;

        //add left node directly after
        addINodeToPacked(bvh, outBVH, cur->leftChild, openPtr);
        //add write node and store a pointer to where it was
        curOut->rightPtr = addINodeToPacked(bvh, outBVH, cur->rightChild, openPtr);
        return idx;
    } else {
        struct PackedBVHLeaf* curOut = &(((struct PackedBVHLeaf*) outBVH)[*openPtr]);
        int idx = *openPtr;
        *openPtr += 1;

        curOut->ptr = 0;
        curOut->primitiveStart = cur->firstPrim;
        curOut->primitiveEnd = cur->firstPrim + cur->primCount;
        curOut->padding4 = 123456789;
        return idx;
    }
}

//builds the intermediate/standard BVH that will then be packed into our own format
struct BVH BuildiBVH(struct TriangleArray* tris) {
    struct BVH bvh;
    bvh.nodes = (struct iBVHNode*) malloc(sizeof(struct iBVHNode) * (tris->numTris * 2 - 1));
    bvh.rootIdx = 0; bvh.nodesUsed = 1;
    struct iBVHNode* root = &bvh.nodes[bvh.rootIdx];
    root->leftChild = 0; root->rightChild = 0;
    root->firstPrim = 0; root->primCount = tris->numTris;

    UpdateNodeBounds(bvh.nodes, tris, bvh.rootIdx);
    SubdivideNode(&bvh, tris, bvh.rootIdx);

    //now pack the triangles
    bvh.triangles = (struct PackedTriangle*) malloc(sizeof(struct PackedTriangle) * tris->numTris);
    for (int i = 0; i < tris->numTris; i++) {
        struct Triangle* curTri = &tris->trianglePool[tris->triangles[i]];
        bvh.triangles[i].v0x = curTri->v0.x;
        bvh.triangles[i].v0y = curTri->v0.y;
        bvh.triangles[i].v0z = curTri->v0.z;
        bvh.triangles[i].v1x = curTri->v1.x;
        bvh.triangles[i].v1y = curTri->v1.y;
        bvh.triangles[i].v1z = curTri->v1.z;
        bvh.triangles[i].v2x = curTri->v2.x;
        bvh.triangles[i].v2y = curTri->v2.y;
        bvh.triangles[i].v2z = curTri->v2.z;
    }

    return bvh;
}

//makes the AABB have the min/max of all of the nodes
void UpdateNodeBounds(struct iBVHNode* bvh, struct TriangleArray* tris, uint index) {
    struct iBVHNode* node = &bvh[index];
    node->AABBMin = ftoVec3(1e30f);
    node->AABBMax = ftoVec3(-1e30f);
    for (uint first = node->firstPrim, i = 0; i < node->primCount; i++) {
        struct Triangle* cur = &tris->trianglePool[tris->triangles[first + i]];
        node->AABBMin = minVec3(node->AABBMin, cur->v0);
        node->AABBMin = minVec3(node->AABBMin, cur->v1);
        node->AABBMin = minVec3(node->AABBMin, cur->v2);
        node->AABBMax = maxVec3(node->AABBMax, cur->v0);
        node->AABBMax = maxVec3(node->AABBMax, cur->v1);
        node->AABBMax = maxVec3(node->AABBMax, cur->v2);
    }
}

int partitionX(struct TriangleArray* tris, uint first, uint last, float split);
int partitionY(struct TriangleArray* tris, uint first, uint last, float split);
int partitionZ(struct TriangleArray* tris, uint first, uint last, float split);
#define BINSPLITS  20
float findSplitPlaneX(struct iBVHNode* node, struct TriangleArray* tris, float* split);
float findSplitPlaneY(struct iBVHNode* node, struct TriangleArray* tris, float* split);
float findSplitPlaneZ(struct iBVHNode* node, struct TriangleArray* tris, float* split);

#define BINNED
//splits a node into two, currently just splitting the largest axis
void SubdivideNode(struct BVH* bvh, struct TriangleArray* tris, uint index) {
    struct iBVHNode* node = &bvh->nodes[index];
    struct vec3 extent = subVec3(node->AABBMax, node->AABBMin);

    #ifdef BINNED
    float splitX = 1e30f; float splitY = 1e30f; float splitZ = 1e30f;
    //printf("binned BVH construction\n");
    float costX = findSplitPlaneX(node, tris, &splitX);
    float costY = findSplitPlaneY(node, tris, &splitY);
    float costZ = findSplitPlaneZ(node, tris, &splitZ);
    float costLeaf = node->primCount * (extent.x * extent.y + extent.x * extent.z + extent.y * extent.z);
    float minCost = min(min(costX, costY), min(costZ, costLeaf));

    int leftCount = 0;
    if (minCost == costLeaf) {
        return;
    }
    else if (costX == minCost) {
        leftCount = partitionX(
            tris, node->firstPrim, node->firstPrim + node->primCount - 1,
            splitX
        );
    } else if (costY == minCost) {
        leftCount = partitionY(
            tris, node->firstPrim, node->firstPrim + node->primCount - 1,
            splitY
        );
    } else if (costZ == minCost) {
        leftCount = partitionZ(
            tris, node->firstPrim, node->firstPrim + node->primCount - 1,
            splitZ
        );
    } else {
        return;
    }
    leftCount -= node->firstPrim;
    #else
    int leftCount = 0;
    if (extent.x >= extent.y && extent.x >= extent.z) {
        leftCount= partitionX(
            tris, node->firstPrim, node->firstPrim + node->primCount - 1, 
            extent.x * .5 + node->AABBMin.x
        );
    } else if (extent.y >= extent.z) {
        leftCount = partitionY(
            tris, node->firstPrim, node->firstPrim + node->primCount - 1, 
            extent.y * .5 + node->AABBMin.y
        );
    } else {
        leftCount = partitionZ(
            tris, node->firstPrim, node->firstPrim + node->primCount - 1, 
            extent.z * .5 + node->AABBMin.z
        );
    }
    leftCount -= node->firstPrim;
    #endif

    if (leftCount == 0 || leftCount == node->primCount) {
        return;
    }

    uint leftChildIdx = bvh->nodesUsed++;
    uint rightChildIdx = bvh->nodesUsed++;
    
    node->leftChild = leftChildIdx;
    node->rightChild = rightChildIdx;
    
    bvh->nodes[node->leftChild].firstPrim = node->firstPrim;
    bvh->nodes[node->leftChild].primCount = leftCount;
    bvh->nodes[node->rightChild].firstPrim = node->firstPrim + leftCount;
    bvh->nodes[node->rightChild].primCount = node->primCount - leftCount;
    node->primCount = 0;

    UpdateNodeBounds(bvh->nodes, tris, leftChildIdx);
    UpdateNodeBounds(bvh->nodes, tris, rightChildIdx);

    SubdivideNode(bvh, tris, leftChildIdx);
    SubdivideNode(bvh, tris, rightChildIdx);
}

//used for binned BVH construction
struct Bin {
    struct vec3 AABBMin;
    struct vec3 AABBMax;
    int triCount;
};

//finds the axis and position of the plane that we should split this BVH node at
//one for each component because I am lazy
float findSplitPlaneX(struct iBVHNode* node, struct TriangleArray* tris, float* split) {
    float bMin = 1e30f; float bMax = -1e30f;
    for (uint i = 0; i < node->primCount; i++) {
        Triangle* cur = &tris->trianglePool[tris->triangles[node->firstPrim + i]];
        bMin = min(bMin, cur->centroid.x);
        bMax = max(bMax, cur->centroid.x);
    }

    if (bMin == bMax) {
        return 1e30f;
    }

    struct Bin bins[BINSPLITS];
    float step = BINSPLITS / (bMax - bMin);

    for (int i = 0; i < BINSPLITS; i++) {
        bins[i].triCount = 0;
        bins[i].AABBMin.x = 1e30f;
        bins[i].AABBMin.y = 1e30f;
        bins[i].AABBMin.z = 1e30f;
        bins[i].AABBMax.x = -1e30f;
        bins[i].AABBMax.y = -1e30f;
        bins[i].AABBMax.z = -1e30f;
    }

    for (uint i = 0; i < node->primCount; i++) {
        Triangle* cur = &tris->trianglePool[tris->triangles[node->firstPrim + i]];
        int goToBin = (cur->centroid.x - bMin) * step;
        if (goToBin >= BINSPLITS) {
            goToBin = BINSPLITS - 1;
        }
        bins[goToBin].triCount++;
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v0);
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v1);
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v2);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v0);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v1);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v2);
    }
    float minCost = 1e30f;
    for (int i = 0; i < BINSPLITS - 1; i++) {
        struct vec3 LAABBMin;LAABBMin.x = 1e30f;LAABBMin.y = 1e30f;LAABBMin.z = 1e30f; 
        struct vec3 LAABBMax;LAABBMax.x =-1e30f;LAABBMax.y =-1e30f;LAABBMax.z =-1e30f;
        struct vec3 RAABBMin;RAABBMin.x = 1e30f;RAABBMin.y = 1e30f;RAABBMin.z = 1e30f;  
        struct vec3 RAABBMax;RAABBMax.x =-1e30f;RAABBMax.y =-1e30f;RAABBMax.z =-1e30f;
        int countLeft = 0; int countRight = 0;
        for (int j = 0; j <= i; j++) {
            LAABBMin = minVec3(LAABBMin, bins[j].AABBMin);
            LAABBMax = maxVec3(LAABBMax, bins[j].AABBMax);
            countLeft += bins[j].triCount;
        }
        for (int j = i + 1; j < BINSPLITS; j++) {
            RAABBMin = minVec3(RAABBMin, bins[j].AABBMin);
            RAABBMax = maxVec3(RAABBMax, bins[j].AABBMax);
            countRight += bins[j].triCount;
        }
        struct vec3 difL = subVec3(LAABBMax, LAABBMin); struct vec3 difR = subVec3(RAABBMax, RAABBMin);
        float cost = countLeft * (difL.x * difL.y + difL.x * difL.z + difL.y * difL.z) +
                    countRight * (difR.x * difR.y + difR.x * difR.z + difR.y * difR.z);

        if (cost < minCost) {
            minCost = cost;
            *split = bMin + (i + 1) * (bMax - bMin) / BINSPLITS;
        }
    }
    return minCost;
}
float findSplitPlaneY(struct iBVHNode* node, struct TriangleArray* tris, float* split) {
    float bMin = 1e30f; float bMax = -1e30f;
    for (uint i = 0; i < node->primCount; i++) {
        Triangle* cur = &tris->trianglePool[tris->triangles[node->firstPrim + i]];
        bMin = min(bMin, cur->centroid.y);
        bMax = max(bMax, cur->centroid.y);
    }

    if (bMin == bMax) {
        return 1e30f;
    }

    struct Bin bins[BINSPLITS];
    float step = BINSPLITS / (bMax - bMin);

    for (int i = 0; i < BINSPLITS; i++) {
        bins[i].triCount = 0;
        bins[i].AABBMin.x = 1e30f;
        bins[i].AABBMin.y = 1e30f;
        bins[i].AABBMin.z = 1e30f;
        bins[i].AABBMax.x = -1e30f;
        bins[i].AABBMax.y = -1e30f;
        bins[i].AABBMax.z = -1e30f;
    }

    for (uint i = 0; i < node->primCount; i++) {
        Triangle* cur = &tris->trianglePool[tris->triangles[node->firstPrim + i]];
        int goToBin = (cur->centroid.y - bMin) * step;
        if (goToBin >= BINSPLITS) {
            goToBin = BINSPLITS - 1;
        }
        bins[goToBin].triCount++;
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v0);
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v1);
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v2);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v0);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v1);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v2);
    }
    float minCost = 1e30f;
    for (int i = 0; i < BINSPLITS - 1; i++) {
        struct vec3 LAABBMin;LAABBMin.x = 1e30f;LAABBMin.y = 1e30f;LAABBMin.z = 1e30f; 
        struct vec3 LAABBMax;LAABBMax.x =-1e30f;LAABBMax.y =-1e30f;LAABBMax.z =-1e30f;
        struct vec3 RAABBMin;RAABBMin.x = 1e30f;RAABBMin.y = 1e30f;RAABBMin.z = 1e30f;  
        struct vec3 RAABBMax;RAABBMax.x =-1e30f;RAABBMax.y =-1e30f;RAABBMax.z =-1e30f;
        int countLeft = 0; int countRight = 0;
        for (int j = 0; j <= i; j++) {
            LAABBMin = minVec3(LAABBMin, bins[j].AABBMin);
            LAABBMax = maxVec3(LAABBMax, bins[j].AABBMax);
            countLeft += bins[j].triCount;
        }
        for (int j = i + 1; j < BINSPLITS; j++) {
            RAABBMin = minVec3(RAABBMin, bins[j].AABBMin);
            RAABBMax = maxVec3(RAABBMax, bins[j].AABBMax);
            countRight += bins[j].triCount;
        }
        struct vec3 difL = subVec3(LAABBMax, LAABBMin); struct vec3 difR = subVec3(RAABBMax, RAABBMin);
        float cost = countLeft * (difL.x * difL.y + difL.x * difL.z + difL.y * difL.z) +
                    countRight * (difR.x * difR.y + difR.x * difR.z + difR.y * difR.z);

        if (cost < minCost) {
            minCost = cost;
            *split = bMin + (i + 1) * (bMax - bMin) / BINSPLITS;
        }
    }
    return minCost;
}
float findSplitPlaneZ(struct iBVHNode* node, struct TriangleArray* tris, float* split) {
    float bMin = 1e30f; float bMax = -1e30f;
    for (uint i = 0; i < node->primCount; i++) {
        Triangle* cur = &tris->trianglePool[tris->triangles[node->firstPrim + i]];
        bMin = min(bMin, cur->centroid.z);
        bMax = max(bMax, cur->centroid.z);
    }

    if (bMin == bMax) {
        return 1e30f;
    }

    struct Bin bins[BINSPLITS];
    float step = BINSPLITS / (bMax - bMin);

    for (int i = 0; i < BINSPLITS; i++) {
        bins[i].triCount = 0;
        bins[i].AABBMin.x = 1e30f;
        bins[i].AABBMin.y = 1e30f;
        bins[i].AABBMin.z = 1e30f;
        bins[i].AABBMax.x = -1e30f;
        bins[i].AABBMax.y = -1e30f;
        bins[i].AABBMax.z = -1e30f;
    }

    for (uint i = 0; i < node->primCount; i++) {
        Triangle* cur = &tris->trianglePool[tris->triangles[node->firstPrim + i]];
        int goToBin = (cur->centroid.z - bMin) * step;
        if (goToBin >= BINSPLITS) {
            goToBin = BINSPLITS - 1;
        }
        bins[goToBin].triCount++;
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v0);
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v1);
        bins[goToBin].AABBMin = minVec3(bins[goToBin].AABBMin, cur->v2);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v0);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v1);
        bins[goToBin].AABBMax = maxVec3(bins[goToBin].AABBMax, cur->v2);
    }
    float minCost = 1e30f;
    for (int i = 0; i < BINSPLITS - 1; i++) {
        struct vec3 LAABBMin;LAABBMin.x = 1e30f;LAABBMin.y = 1e30f;LAABBMin.z = 1e30f; 
        struct vec3 LAABBMax;LAABBMax.x =-1e30f;LAABBMax.y =-1e30f;LAABBMax.z =-1e30f;
        struct vec3 RAABBMin;RAABBMin.x = 1e30f;RAABBMin.y = 1e30f;RAABBMin.z = 1e30f;  
        struct vec3 RAABBMax;RAABBMax.x =-1e30f;RAABBMax.y =-1e30f;RAABBMax.z =-1e30f;
        int countLeft = 0; int countRight = 0;
        for (int j = 0; j <= i; j++) {
            LAABBMin = minVec3(LAABBMin, bins[j].AABBMin);
            LAABBMax = maxVec3(LAABBMax, bins[j].AABBMax);
            countLeft += bins[j].triCount;
        }
        for (int j = i + 1; j < BINSPLITS; j++) {
            RAABBMin = minVec3(RAABBMin, bins[j].AABBMin);
            RAABBMax = maxVec3(RAABBMax, bins[j].AABBMax);
            countRight += bins[j].triCount;
        }
        struct vec3 difL = subVec3(LAABBMax, LAABBMin); struct vec3 difR = subVec3(RAABBMax, RAABBMin);
        float cost = countLeft * (difL.x * difL.y + difL.x * difL.z + difL.y * difL.z) +
                    countRight * (difR.x * difR.y + difR.x * difR.z + difR.y * difR.z);

        if (cost < minCost) {
            minCost = cost;
            *split = bMin + (i + 1) * (bMax - bMin) / BINSPLITS;
        }
    }
    return minCost;
}

//splits the triangles by their centroid as compared to the split plane
//note that last is not the bounds, it is the actual primitive (bounds - 1)
int partitionX(struct TriangleArray* tris, uint first, uint last, float split) {
    while (first <= last && last <= tris->numTris) {
        if (tris->trianglePool[tris->triangles[first]].centroid.x < split) {
            first++;
        } else {
            uint temp = tris->triangles[first];
            tris->triangles[first] = tris->triangles[last];
            tris->triangles[last] = temp;
            last -= 1;
        }
    }
    return first;
}
int partitionY(struct TriangleArray* tris, uint first, uint last, float split) {
    while (first <= last && last <= tris->numTris) {
        if (tris->trianglePool[tris->triangles[first]].centroid.y < split) {
            first++;
        } else {
            uint temp = tris->triangles[first];
            tris->triangles[first] = tris->triangles[last];
            tris->triangles[last] = temp;
            last -= 1;
        }
    }
    return first;
}
int partitionZ(struct TriangleArray* tris, uint first, uint last, float split) {
    while (first <= last && last <= tris->numTris) {
        if (tris->trianglePool[tris->triangles[first]].centroid.z < split) {
            first++;
        } else {
            uint temp = tris->triangles[first];
            tris->triangles[first] = tris->triangles[last];
            tris->triangles[last] = temp;
            last -= 1;
        }
    }
    return first;
}


//rewrites the array of vertices to a better format and calculate the centroids
struct TriangleArray genTriArray(float* inTris, int numTris) {
    struct Triangle* trianglePool = (struct Triangle*) malloc(sizeof(struct Triangle) * numTris);
    Tri* triangles = (Tri*) malloc(sizeof(Tri) * numTris);
    for (int i = 0; i < numTris; i++) {
        triangles[i] = i;
        trianglePool[i].v0.x = inTris[9 * i + 0];
        trianglePool[i].v0.y = inTris[9 * i + 1];
        trianglePool[i].v0.z = inTris[9 * i + 2];
        trianglePool[i].v1.x = inTris[9 * i + 3];
        trianglePool[i].v1.y = inTris[9 * i + 4];
        trianglePool[i].v1.z = inTris[9 * i + 5];
        trianglePool[i].v2.x = inTris[9 * i + 6];
        trianglePool[i].v2.y = inTris[9 * i + 7];
        trianglePool[i].v2.z = inTris[9 * i + 8];
        trianglePool[i].centroid = multVec3(
            addVec3(addVec3(trianglePool[i].v0, trianglePool[i].v1), trianglePool[i].v2), .333333f
        );
    }

    struct TriangleArray returned;
    returned.numTris = numTris;
    returned.trianglePool = trianglePool;
    returned.triangles = triangles;
    return returned;
}

//helper functions
struct vec3 addVec3(struct vec3 x, struct vec3 y) {
    struct vec3 returned;
    returned.x = x.x + y.x;
    returned.y = x.y + y.y;
    returned.z = x.z + y.z;
    return returned;
}
struct vec3 subVec3(struct vec3 a, struct vec3 b) {
    struct vec3 returned;
    returned.x = a.x - b.x;
    returned.y = a.y - b.y;
    returned.z = a.z - b.z;
    return returned;
}
struct vec3 multVec3(struct vec3 x, float a) {
    struct vec3 returned;
    returned.x = x.x * a;
    returned.y = x.y * a;
    returned.z = x.z * a;
    return returned;
}
struct vec3 ftoVec3(float a) {
    struct vec3 returned;
    returned.x = a; returned.y = a; returned.z = a;
    return returned;
}
float min(float a, float b) {
    return a < b ? a : b;
}
struct vec3 minVec3(struct vec3 a, struct vec3 b) {
    struct vec3 returned;
    returned.x = min(a.x, b.x);
    returned.y = min(a.y, b.y);
    returned.z = min(a.z, b.z);
    return returned;
}
float max(float a, float b) {
    return a > b ? a : b;
}
struct vec3 maxVec3(struct vec3 a, struct vec3 b) {
    struct vec3 returned;
    returned.x = max(a.x, b.x);
    returned.y = max(a.y, b.y);
    returned.z = max(a.z, b.z);
    return returned;
}